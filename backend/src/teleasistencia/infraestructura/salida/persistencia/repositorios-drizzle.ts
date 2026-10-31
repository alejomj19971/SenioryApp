import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { ConflictoDeEstado } from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type {
  RepositorioAlertas,
  RepositorioLecturas,
  RepositorioRangos,
} from '../../../aplicacion/puertos/salida/repositorios.js';
import type { Alerta, AlertaId } from '../../../dominio/alerta.js';
import type {
  LecturaDeSignos,
  RangosDeReferencia,
} from '../../../dominio/signos.js';
import { alertaDeFila, lecturaDeFila, rangosDeFila } from './mapeadores.js';
import {
  alertas,
  lecturasSignos,
  rangosDeReferencia,
} from './teleasistencia.esquema.js';

export class RepositorioLecturasDrizzle implements RepositorioLecturas {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(lectura: LecturaDeSignos): Promise<void> {
    await this.contexto.conexion().insert(lecturasSignos).values({
      id: lectura.id,
      adultoMayorId: lectura.adultoMayorId,
      tomadaEn: lectura.tomadaEn,
      presionSistolica: lectura.presionSistolica,
      presionDiastolica: lectura.presionDiastolica,
      frecuenciaCardiaca: lectura.frecuenciaCardiaca,
      glucosa: lectura.glucosa,
      fueraDeRango: lectura.fueraDeRango,
      fuente: lectura.fuente,
      registradaPor: lectura.registradaPor,
      creadaEn: lectura.creadaEn,
    });
  }

  async listarDesde(
    adultoMayorId: string,
    desde: Date,
  ): Promise<LecturaDeSignos[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(lecturasSignos)
      .where(
        and(
          eq(lecturasSignos.adultoMayorId, adultoMayorId),
          gte(lecturasSignos.tomadaEn, desde),
        ),
      )
      .orderBy(desc(lecturasSignos.tomadaEn), desc(lecturasSignos.id));
    return filas.map(lecturaDeFila);
  }

  async ultima(adultoMayorId: string): Promise<LecturaDeSignos | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(lecturasSignos)
      .where(eq(lecturasSignos.adultoMayorId, adultoMayorId))
      .orderBy(desc(lecturasSignos.tomadaEn), desc(lecturasSignos.id))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : lecturaDeFila(fila);
  }
}

export class RepositorioRangosDrizzle implements RepositorioRangos {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async obtener(adultoMayorId: string): Promise<RangosDeReferencia | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(rangosDeReferencia)
      .where(eq(rangosDeReferencia.adultoMayorId, adultoMayorId))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : rangosDeFila(fila);
  }

  async guardar(
    adultoMayorId: string,
    rangos: RangosDeReferencia,
    definidosPor: string,
    ahora: Date,
  ): Promise<void> {
    const valores = {
      sistolicaMin: rangos.sistolicaMin,
      sistolicaMax: rangos.sistolicaMax,
      diastolicaMin: rangos.diastolicaMin,
      diastolicaMax: rangos.diastolicaMax,
      frecuenciaMin: rangos.frecuenciaMin,
      frecuenciaMax: rangos.frecuenciaMax,
      glucosaMin: rangos.glucosaMin,
      glucosaMax: rangos.glucosaMax,
      definidosPor,
      actualizadosEn: ahora,
    };
    await this.contexto
      .conexion()
      .insert(rangosDeReferencia)
      .values({ adultoMayorId, ...valores })
      .onConflictDoUpdate({
        target: rangosDeReferencia.adultoMayorId,
        set: valores,
      });
  }
}

export class RepositorioAlertasDrizzle implements RepositorioAlertas {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(alerta: Alerta): Promise<void> {
    try {
      await this.contexto.conexion().insert(alertas).values({
        id: alerta.id,
        adultoMayorId: alerta.adultoMayorId,
        origen: alerta.origen,
        estado: alerta.estado,
        generadaPor: alerta.generadaPor,
        claveIdempotencia: alerta.claveDeIdempotencia,
        generadaEn: alerta.generadaEn,
        primeraEntregaEn: alerta.primeraEntregaEn,
        atendidaPor: alerta.atendidaPor,
        atendidaEn: alerta.atendidaEn,
        nota: alerta.nota,
      });
    } catch (error) {
      // Tras este error la transacción en curso queda abortada: el caso de uso debe dejar que se revierta.
      if (esViolacionDeUnicidad(error, 'alertas_idempotencia_unica')) {
        throw new ConflictoDeEstado(
          'Esa alerta ya fue enviada',
          'alerta.clave_repetida',
        );
      }
      throw error;
    }
  }

  async actualizar(alerta: Alerta): Promise<void> {
    await this.contexto
      .conexion()
      .update(alertas)
      .set({
        estado: alerta.estado,
        primeraEntregaEn: alerta.primeraEntregaEn,
        atendidaPor: alerta.atendidaPor,
        atendidaEn: alerta.atendidaEn,
        nota: alerta.nota,
      })
      .where(eq(alertas.id, alerta.id));
  }

  async buscarPorId(id: AlertaId): Promise<Alerta | null> {
    return this.buscar(id, false);
  }

  async buscarPorIdParaActualizar(id: AlertaId): Promise<Alerta | null> {
    return this.buscar(id, true);
  }

  private async buscar(
    id: AlertaId,
    bloquear: boolean,
  ): Promise<Alerta | null> {
    const consulta = this.contexto
      .conexion()
      .select()
      .from(alertas)
      .where(eq(alertas.id, id))
      .limit(1);
    const filas = await (bloquear ? consulta.for('no key update') : consulta);
    const fila = filas[0];
    return fila === undefined ? null : alertaDeFila(fila);
  }

  async buscarPorClave(
    generadaPor: string,
    claveDeIdempotencia: string,
  ): Promise<Alerta | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(alertas)
      .where(
        and(
          eq(alertas.generadaPor, generadaPor),
          eq(alertas.claveIdempotencia, claveDeIdempotencia),
        ),
      )
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : alertaDeFila(fila);
  }

  async contarAbiertas(adultoMayorId: string): Promise<number> {
    const [fila] = await this.contexto
      .conexion()
      .select({ total: sql<number>`count(*)::int` })
      .from(alertas)
      .where(
        and(
          eq(alertas.adultoMayorId, adultoMayorId),
          ne(alertas.estado, 'atendida'),
        ),
      );
    return fila?.total ?? 0;
  }
}
