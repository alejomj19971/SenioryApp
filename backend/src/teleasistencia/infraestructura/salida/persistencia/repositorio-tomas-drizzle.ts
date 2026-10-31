import { and, asc, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { RepositorioTomas } from '../../../aplicacion/puertos/salida/repositorios.js';
import type { Medicamento } from '../../../dominio/medicamento.js';
import type { Toma, TomaId } from '../../../dominio/toma.js';
import { tomaDeFila } from './mapeadores.js';
import { tomas } from './teleasistencia.esquema.js';

export class RepositorioTomasDrizzle implements RepositorioTomas {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async generarDelDia(
    medicamento: Medicamento,
    fecha: FechaCivil,
  ): Promise<void> {
    if (!medicamento.aplicaEl(fecha) || medicamento.horarios.length === 0)
      return;
    await this.contexto
      .conexion()
      .insert(tomas)
      .values(
        medicamento.horarios.map((hora) => ({
          id: uuidv7(),
          medicamentoId: medicamento.id,
          adultoMayorId: medicamento.adultoMayorId,
          fecha: fecha.aTexto(),
          horaProgramada: hora,
        })),
      )
      // Una por medicamento, día y hora: generar dos veces (o dos peticiones a la vez) no duplica nada.
      .onConflictDoNothing({
        target: [tomas.medicamentoId, tomas.fecha, tomas.horaProgramada],
      });
  }

  async listarDelDia(
    adultoMayorId: string,
    fecha: FechaCivil,
  ): Promise<Toma[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(tomas)
      .where(
        and(
          eq(tomas.adultoMayorId, adultoMayorId),
          eq(tomas.fecha, fecha.aTexto()),
        ),
      )
      .orderBy(asc(tomas.horaProgramada), asc(tomas.medicamentoId));
    return filas.map(tomaDeFila);
  }

  async buscarPorId(id: TomaId): Promise<Toma | null> {
    return this.buscar(id, false);
  }

  async buscarPorIdParaActualizar(id: TomaId): Promise<Toma | null> {
    return this.buscar(id, true);
  }

  private async buscar(id: TomaId, bloquear: boolean): Promise<Toma | null> {
    const consulta = this.contexto
      .conexion()
      .select()
      .from(tomas)
      .where(eq(tomas.id, id))
      .limit(1);
    // NO KEY UPDATE: la fila cambia (estado, quién la registró) pero nunca su clave.
    const filas = await (bloquear ? consulta.for('no key update') : consulta);
    const fila = filas[0];
    return fila === undefined ? null : tomaDeFila(fila);
  }

  async actualizar(toma: Toma): Promise<void> {
    const actualizadas = await this.contexto
      .conexion()
      .update(tomas)
      .set({
        estado: toma.estado,
        registradaPor: toma.registradaPor,
        registradaEn: toma.registradaEn,
        version: toma.version,
      })
      // Bloqueo optimista: solo si nadie la cambió desde que se leyó.
      .where(
        and(
          eq(tomas.id, toma.id),
          eq(tomas.version, toma.versionLeidaDeLaBase),
        ),
      )
      .returning({ id: tomas.id });
    if (actualizadas.length === 0) {
      const existe = await this.contexto
        .conexion()
        .select({ id: tomas.id })
        .from(tomas)
        .where(eq(tomas.id, toma.id))
        .limit(1);
      if (existe.length === 0) {
        throw new RecursoNoEncontrado(
          'La toma no existe',
          'toma.no_encontrada',
        );
      }
      throw new ConflictoDeEstado(
        'La toma cambió mientras se procesaba esta acción; vuelve a intentarlo',
        'toma.modificada',
      );
    }
  }

  async listarVencidas(
    limiteInstante: Date,
    zona: string,
    limite: number,
  ): Promise<TomaId[]> {
    const filas = await this.contexto
      .conexion()
      .select({ id: tomas.id })
      .from(tomas)
      .where(
        and(
          eq(tomas.estado, 'pendiente'),
          // La hora programada es de pared en la zona del negocio: se convierte a instante para compararla.
          sql`((${tomas.fecha} + ${tomas.horaProgramada}) at time zone ${zona}) <= ${limiteInstante.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(asc(tomas.fecha), asc(tomas.horaProgramada))
      .limit(limite);
    return filas.map((fila) => fila.id as TomaId);
  }
}
