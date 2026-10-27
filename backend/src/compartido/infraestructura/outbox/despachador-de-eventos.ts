import { Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Reloj } from '../../aplicacion/puertos/reloj.js';
import type { EventoDeIntegracion } from '../../eventos/evento-de-integracion.js';
import type { BaseDeDatos } from '../base-de-datos/base-de-datos.module.js';
import {
  eventosConsumidos,
  outbox,
} from '../base-de-datos/compartido.esquema.js';
import type { ContextoTransaccional } from '../base-de-datos/contexto-transaccional.js';
import type { RegistroDeManejadores } from './registro-de-manejadores.js';

export interface OpcionesDelDespachador {
  // Intentos fallidos antes de marcar el evento como fallido y dejar de reintentarlo.
  maximoDeIntentos: number;
  // Cuánto tiempo queda reservado un evento para quien lo reclamó. Si el proceso muere a mitad
  // de la entrega, otro lo toma cuando vence la reserva.
  reservaMs: number;
  // Eventos reclamados por vuelta.
  lote: number;
  // Espera tras el primer fallo; se duplica en cada intento hasta `esperaMaximaMs`.
  esperaBaseMs: number;
  esperaMaximaMs: number;
}

export const OPCIONES_POR_DEFECTO: OpcionesDelDespachador = {
  maximoDeIntentos: 10, // con espera creciente: ~17 minutos de reintentos en total
  reservaMs: 60_000,
  lote: 50,
  esperaBaseMs: 1_000,
  esperaMaximaMs: 10 * 60_000,
};

const LARGO_MAXIMO_DEL_ERROR = 2_000;

type FilaDelOutbox = typeof outbox.$inferSelect;

// Entrega los eventos del outbox a sus manejadores (M0 §4.8).
//
// Garantías:
// - Al menos una vez: un evento confirmado se entrega aunque el proceso se reinicie (el sondeo lo
//   recupera) y, si un manejador falla, se reintenta con espera creciente.
// - Exactamente una vez por manejador: cada manejador corre en su propia transacción junto con su
//   fila en `eventos_consumidos`; si el evento vuelve a llegar, esa fila ya existe y no se repite.
// - Varias instancias pueden despachar a la vez: cada evento se reclama con FOR UPDATE SKIP LOCKED
//   y se reserva adelantando su `proxima_ejecucion`, así que nunca lo procesan dos al mismo tiempo.
export class DespachadorDeEventos {
  private readonly opciones: OpcionesDelDespachador;
  private readonly registroDeLog = new Logger('DespachadorDeEventos');
  private readonly entregasEnCurso = new Set<Promise<unknown>>();

  constructor(
    private readonly bd: BaseDeDatos,
    private readonly contexto: ContextoTransaccional,
    private readonly registro: RegistroDeManejadores,
    private readonly reloj: Reloj,
    opciones: Partial<OpcionesDelDespachador> = {},
  ) {
    this.opciones = { ...OPCIONES_POR_DEFECTO, ...opciones };
  }

  // Entrega en segundo plano eventos recién confirmados, sin esperar al sondeo. No lanza: si algo
  // falla, el evento sigue pendiente y el sondeo lo reintenta.
  programar(ids: readonly string[]): void {
    const entrega = this.procesarPendientes(ids).catch((error: unknown) => {
      this.registroDeLog.error(
        `No se pudo entregar al instante: ${mensajeDe(error)}`,
      );
    });
    this.entregasEnCurso.add(entrega);
    void entrega.finally(() => this.entregasEnCurso.delete(entrega));
  }

  // Para apagar ordenadamente: espera a que terminen las entregas programadas.
  async esperarEntregas(): Promise<void> {
    await Promise.allSettled(this.entregasEnCurso);
  }

  // Reclama eventos vencidos (todos, o solo los `ids` indicados), los entrega y devuelve cuántos
  // tomó. Los que no tienen manejadores se marcan procesados.
  async procesarPendientes(ids?: readonly string[]): Promise<number> {
    if (ids?.length === 0) return 0;
    const reclamados = await this.reclamar(ids);
    reclamados.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
    for (const fila of reclamados) {
      await this.entregar(fila);
    }
    return reclamados.length;
  }

  private async reclamar(ids?: readonly string[]): Promise<FilaDelOutbox[]> {
    const ahora = this.reloj.ahora();
    const vencidos = this.bd
      .select({ id: outbox.id })
      .from(outbox)
      .where(
        and(
          isNull(outbox.procesadoEn),
          isNull(outbox.fallidoEn),
          lte(outbox.proximaEjecucion, ahora),
          ids === undefined ? undefined : inArray(outbox.id, [...ids]),
        ),
      )
      .orderBy(asc(outbox.proximaEjecucion))
      .limit(this.opciones.lote)
      .for('update', { skipLocked: true });

    return this.bd
      .update(outbox)
      .set({
        proximaEjecucion: new Date(ahora.getTime() + this.opciones.reservaMs),
      })
      .where(inArray(outbox.id, vencidos))
      .returning();
  }

  private async entregar(fila: FilaDelOutbox): Promise<void> {
    const evento: EventoDeIntegracion = {
      id: fila.id,
      tipo: fila.tipo,
      version: fila.version,
      ocurridoEn: fila.creadoEn.toISOString(),
      idDeCorrelacion: fila.idDeCorrelacion,
      datos: fila.datos,
    };

    const errores: string[] = [];
    for (const manejador of this.registro.para(fila.tipo)) {
      try {
        await this.contexto.ejecutar(async () => {
          const nuevo = await this.contexto
            .transaccionActual()
            .insert(eventosConsumidos)
            .values({
              manejador: manejador.nombre,
              eventoId: fila.id,
              consumidoEn: this.reloj.ahora(),
            })
            .onConflictDoNothing()
            .returning({ eventoId: eventosConsumidos.eventoId });
          // Ya lo procesó en un intento anterior: no se repite.
          if (nuevo.length === 0) return;
          await manejador.manejar(evento);
        });
      } catch (error) {
        errores.push(`${manejador.nombre}: ${mensajeDe(error)}`);
      }
    }

    const ahora = this.reloj.ahora();
    if (errores.length === 0) {
      await this.bd
        .update(outbox)
        .set({ procesadoEn: ahora, ultimoError: null })
        .where(eq(outbox.id, fila.id));
      return;
    }

    const intentos = fila.intentos + 1;
    const ultimoError = errores.join(' | ').slice(0, LARGO_MAXIMO_DEL_ERROR);
    if (intentos >= this.opciones.maximoDeIntentos) {
      await this.bd
        .update(outbox)
        .set({ intentos, fallidoEn: ahora, ultimoError })
        .where(eq(outbox.id, fila.id));
      // TODO(M0 PR 5): reportar también a Sentry cuando se instale.
      this.registroDeLog.error(
        `Evento ${fila.id} (${fila.tipo}) marcado como fallido tras ${intentos} intentos: ${ultimoError}`,
      );
      return;
    }

    await this.bd
      .update(outbox)
      .set({
        intentos,
        proximaEjecucion: new Date(ahora.getTime() + this.espera(intentos)),
        ultimoError,
      })
      .where(eq(outbox.id, fila.id));
    this.registroDeLog.warn(
      `Evento ${fila.id} (${fila.tipo}) falló en el intento ${intentos}; se reintentará: ${ultimoError}`,
    );
  }

  // 1 s, 2 s, 4 s, 8 s… hasta el máximo.
  private espera(intentos: number): number {
    return Math.min(
      this.opciones.esperaBaseMs * 2 ** (intentos - 1),
      this.opciones.esperaMaximaMs,
    );
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
