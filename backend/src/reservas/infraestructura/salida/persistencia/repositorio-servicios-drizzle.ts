import { and, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type {
  DuenoDeServicios,
  FiltroDeServicios,
  PaginaDeServicios,
  RepositorioServicios,
} from '../../../aplicacion/puertos/salida/repositorio-servicios.js';
import type { CursorDeServicios } from '../../../dominio/cursor-de-servicios.js';
import type { ServicioId } from '../../../dominio/ids.js';
import type {
  Servicio,
  TransicionDeServicio,
} from '../../../dominio/servicio.js';
import { servicioDeFila } from './mapeadores.js';
import { historialDeEstados, servicios } from './reservas.esquema.js';

export class RepositorioServiciosDrizzle implements RepositorioServicios {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(servicio: Servicio): Promise<void> {
    await this.contexto.ejecutar(async () => {
      try {
        await this.contexto.conexion().insert(servicios).values({
          id: servicio.id,
          familiarId: servicio.familiarId,
          adultoMayorId: servicio.adultoMayorId,
          cuidadorId: servicio.cuidadorId,
          fecha: servicio.fecha.aTexto(),
          jornada: servicio.jornada,
          horas: servicio.horas,
          estado: servicio.estado,
          medioDePago: servicio.medioDePago,
          aceptacionAutomatica: servicio.aceptacionAutomatica,
          solicitudExpiraEn: servicio.solicitudExpiraEn,
          tarifaHora: servicio.tarifaHora,
          subtotal: servicio.subtotal,
          cargoFamilia: servicio.cargoFamilia,
          totalFamilia: servicio.totalFamilia,
          pagoProfesional: servicio.pagoProfesional,
          politicaVersion: servicio.politicaVersion,
          claveIdempotencia: servicio.claveDeIdempotencia,
          pagadoEn: servicio.pagadoEn,
          solicitadoEn: servicio.solicitadoEn,
          aceptadoEn: servicio.aceptadoEn,
          iniciadoEn: servicio.iniciadoEn,
          finalizadoEn: servicio.finalizadoEn,
          canceladoEn: servicio.canceladoEn,
          canceladoPor: servicio.canceladoPor,
          motivoCancelacion: servicio.motivoDeCancelacion,
          version: servicio.version,
          creadoEn: servicio.creadoEn,
          actualizadoEn: servicio.actualizadoEn,
        });
      } catch (error) {
        // Tras estos errores la transacción en curso queda abortada: el caso de uso debe dejar que se revierta.
        if (esViolacionDeUnicidad(error, 'servicios_sin_doble_reserva')) {
          throw new ConflictoDeEstado(
            'El cuidador ya tiene un servicio en esa fecha y franja',
            'servicio.franja_ocupada',
          );
        }
        if (esViolacionDeUnicidad(error, 'servicios_idempotencia_unica')) {
          throw new ConflictoDeEstado(
            'Esa solicitud ya fue enviada',
            'servicio.clave_repetida',
          );
        }
        throw error;
      }
      await this.escribirHistorial(
        servicio.id,
        servicio.transicionesPendientes,
      );
    });
  }

  async actualizar(servicio: Servicio): Promise<void> {
    await this.contexto.ejecutar(async () => {
      const actualizados = await this.contexto
        .conexion()
        .update(servicios)
        .set({
          estado: servicio.estado,
          solicitudExpiraEn: servicio.solicitudExpiraEn,
          pagadoEn: servicio.pagadoEn,
          aceptadoEn: servicio.aceptadoEn,
          iniciadoEn: servicio.iniciadoEn,
          finalizadoEn: servicio.finalizadoEn,
          canceladoEn: servicio.canceladoEn,
          canceladoPor: servicio.canceladoPor,
          motivoCancelacion: servicio.motivoDeCancelacion,
          version: servicio.version,
          actualizadoEn: servicio.actualizadoEn,
        })
        // Bloqueo optimista: solo si nadie lo cambió desde que se leyó.
        .where(
          and(
            eq(servicios.id, servicio.id),
            eq(servicios.version, servicio.versionLeida),
          ),
        )
        .returning({ id: servicios.id });
      if (actualizados.length === 0) {
        const existe = await this.contexto
          .conexion()
          .select({ id: servicios.id })
          .from(servicios)
          .where(eq(servicios.id, servicio.id))
          .limit(1);
        if (existe.length === 0) {
          throw new RecursoNoEncontrado(
            'El servicio no existe',
            'servicio.no_encontrado',
          );
        }
        throw new ConflictoDeEstado(
          'El servicio cambió mientras se procesaba esta acción; vuelve a intentarlo',
          'servicio.modificado',
        );
      }
      await this.escribirHistorial(
        servicio.id,
        servicio.transicionesPendientes,
      );
    });
  }

  async buscarPorId(id: ServicioId): Promise<Servicio | null> {
    return this.buscar(id, false);
  }

  async buscarPorIdParaActualizar(id: ServicioId): Promise<Servicio | null> {
    return this.buscar(id, true);
  }

  private async buscar(
    id: ServicioId,
    bloquear: boolean,
  ): Promise<Servicio | null> {
    const consulta = this.contexto
      .conexion()
      .select()
      .from(servicios)
      .where(eq(servicios.id, id))
      .limit(1);
    // NO KEY UPDATE: la fila cambia (estado, marcas de tiempo) pero nunca su clave.
    const filas = await (bloquear ? consulta.for('no key update') : consulta);
    const fila = filas[0];
    return fila === undefined ? null : servicioDeFila(fila);
  }

  async buscarPorClave(
    familiarId: string,
    claveDeIdempotencia: string,
  ): Promise<Servicio | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(servicios)
      .where(
        and(
          eq(servicios.familiarId, familiarId),
          eq(servicios.claveIdempotencia, claveDeIdempotencia),
        ),
      )
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : servicioDeFila(fila);
  }

  async listarDe(
    dueno: DuenoDeServicios,
    filtro: FiltroDeServicios,
    limite: number,
    cursor: CursorDeServicios | null,
  ): Promise<PaginaDeServicios> {
    const condiciones: (SQL | undefined)[] = [
      dueno.tipo === 'familiar'
        ? eq(servicios.familiarId, dueno.familiarId)
        : eq(servicios.cuidadorId, dueno.cuidadorId),
    ];
    if (filtro.estado !== undefined) {
      condiciones.push(eq(servicios.estado, filtro.estado));
    }
    if (cursor !== null) {
      // Lo que va DESPUÉS de la última fila vista, en el orden (creado_en desc, id desc).
      condiciones.push(
        sql`(${servicios.creadoEn}, ${servicios.id}) < (${cursor.creadoEn.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
    // Una fila de más para saber si hay otra página sin hacer una segunda consulta.
    const filas = await this.contexto
      .conexion()
      .select()
      .from(servicios)
      .where(and(...condiciones))
      .orderBy(desc(servicios.creadoEn), desc(servicios.id))
      .limit(limite + 1);

    const hayMas = filas.length > limite;
    const lista = (hayMas ? filas.slice(0, limite) : filas).map(servicioDeFila);
    const ultimo = lista.at(-1);
    return {
      servicios: lista,
      siguiente:
        hayMas && ultimo !== undefined
          ? { creadoEn: ultimo.creadoEn, id: ultimo.id }
          : null,
    };
  }

  async listarSolicitudesVencidas(
    ahora: Date,
    limite: number,
  ): Promise<ServicioId[]> {
    const filas = await this.contexto
      .conexion()
      .select({ id: servicios.id })
      .from(servicios)
      .where(
        and(
          eq(servicios.estado, 'solicitado'),
          lte(servicios.solicitudExpiraEn, ahora),
        ),
      )
      .orderBy(servicios.solicitudExpiraEn)
      .limit(limite);
    return filas.map((fila) => fila.id as ServicioId);
  }

  async listarActivosDeAdultoMayor(
    adultoMayorId: string,
    desde: FechaCivil,
  ): Promise<Servicio[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(servicios)
      .where(
        and(
          eq(servicios.adultoMayorId, adultoMayorId),
          inArray(servicios.estado, ['aceptado', 'en_curso']),
          gte(servicios.fecha, desde.aTexto()),
        ),
      )
      .orderBy(servicios.fecha);
    return filas.map(servicioDeFila);
  }

  private async escribirHistorial(
    servicioId: string,
    transiciones: readonly TransicionDeServicio[],
  ): Promise<void> {
    if (transiciones.length === 0) return;
    await this.contexto
      .conexion()
      .insert(historialDeEstados)
      .values(
        transiciones.map((t) => ({
          id: uuidv7(),
          servicioId,
          desde: t.desde,
          hacia: t.hacia,
          accion: t.accion,
          actorId: t.actorId,
          ocurridoEn: t.ocurridoEn,
        })),
      );
  }
}
