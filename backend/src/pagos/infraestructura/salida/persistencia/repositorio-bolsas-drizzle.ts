import { and, desc, eq } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioBolsas } from '../../../aplicacion/puertos/salida/repositorios.js';
import { Bolsa, type MovimientoDeBolsa } from '../../../dominio/bolsa.js';
import type { BolsaId } from '../../../dominio/ids.js';
import { bolsaDeFila, movimientoDeFila } from './mapeadores.js';
import { bolsas, movimientosDeBolsa } from './pagos.esquema.js';

export class RepositorioBolsasDrizzle implements RepositorioBolsas {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async buscarPorFamiliar(familiarId: string): Promise<Bolsa | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(bolsas)
      .where(eq(bolsas.familiarId, familiarId))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : bolsaDeFila(fila);
  }

  async obtenerOCrearParaActualizar(
    familiarId: string,
    idSiSeCrea: BolsaId,
    ahora: Date,
  ): Promise<Bolsa> {
    // Dos llamadas simultáneas: una inserta y la otra no hace nada. Las dos terminan leyendo la misma fila.
    const nueva = Bolsa.abrir(idSiSeCrea, familiarId, ahora);
    await this.contexto
      .conexion()
      .insert(bolsas)
      .values({
        id: nueva.id,
        familiarId,
        saldoDisponible: 0,
        saldoReservado: 0,
        version: nueva.version,
        creadaEn: ahora,
        actualizadaEn: ahora,
      })
      .onConflictDoNothing({ target: bolsas.familiarId });
    const filas = await this.contexto
      .conexion()
      .select()
      .from(bolsas)
      .where(eq(bolsas.familiarId, familiarId))
      .limit(1)
      .for('no key update');
    const fila = filas[0];
    if (fila === undefined) {
      throw new RecursoNoEncontrado(
        'No se pudo abrir la bolsa',
        'bolsa.no_encontrada',
      );
    }
    return bolsaDeFila(fila);
  }

  async guardar(bolsa: Bolsa): Promise<void> {
    await this.contexto.ejecutar(async () => {
      const actualizadas = await this.contexto
        .conexion()
        .update(bolsas)
        .set({
          saldoDisponible: bolsa.saldoDisponible,
          saldoReservado: bolsa.saldoReservado,
          version: bolsa.version,
          actualizadaEn: bolsa.actualizadaEn,
        })
        // Bloqueo optimista. Los saldos negativos, además, los impide un CHECK de la base.
        .where(
          and(eq(bolsas.id, bolsa.id), eq(bolsas.version, bolsa.versionLeida)),
        )
        .returning({ id: bolsas.id });
      if (actualizadas.length === 0) {
        throw new ConflictoDeEstado(
          'La bolsa cambió mientras se procesaba; vuelve a intentarlo',
          'bolsa.version_obsoleta',
        );
      }
      for (const movimiento of bolsa.movimientosPendientes) {
        try {
          await this.contexto.conexion().insert(movimientosDeBolsa).values({
            id: movimiento.id,
            bolsaId: movimiento.bolsaId,
            tipo: movimiento.tipo,
            deltaDisponible: movimiento.deltaDisponible,
            deltaReservado: movimiento.deltaReservado,
            servicioId: movimiento.servicioId,
            pagoId: movimiento.pagoId,
            creadoEn: movimiento.creadoEn,
          });
        } catch (error) {
          // Tras este error la transacción queda abortada: el caso de uso debe dejar que se revierta.
          if (esViolacionDeUnicidad(error, 'movimientos_servicio_unico')) {
            throw new ConflictoDeEstado(
              'Ese movimiento ya estaba registrado para el servicio',
              'bolsa.movimiento_repetido',
            );
          }
          throw error;
        }
      }
    });
  }

  async movimientosDelServicio(
    bolsaId: BolsaId,
    servicioId: string,
  ): Promise<MovimientoDeBolsa[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(movimientosDeBolsa)
      .where(
        and(
          eq(movimientosDeBolsa.bolsaId, bolsaId),
          eq(movimientosDeBolsa.servicioId, servicioId),
        ),
      )
      .orderBy(movimientosDeBolsa.creadoEn);
    return filas.map(movimientoDeFila);
  }

  async ultimosMovimientos(
    bolsaId: BolsaId,
    limite: number,
  ): Promise<MovimientoDeBolsa[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(movimientosDeBolsa)
      .where(eq(movimientosDeBolsa.bolsaId, bolsaId))
      .orderBy(desc(movimientosDeBolsa.creadoEn), desc(movimientosDeBolsa.id))
      .limit(limite);
    return filas.map(movimientoDeFila);
  }
}
