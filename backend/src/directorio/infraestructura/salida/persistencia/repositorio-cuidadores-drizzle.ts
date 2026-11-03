import { and, asc, desc, eq, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type {
  FilaDeVerificacion,
  FiltrosDisponibles,
  PaginaDeCuidadores,
  RepositorioCuidadores,
} from '../../../aplicacion/puertos/salida/repositorio-cuidadores.js';
import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Cuidador } from '../../../dominio/cuidador.js';
import type {
  CursorDeCuidadores,
  FiltrosDeCuidadores,
} from '../../../dominio/filtros-de-cuidadores.js';
import type { CuidadorId, VerificacionId } from '../../../dominio/ids.js';
import { normalizarParaBuscar } from '../../../dominio/texto-de-busqueda.js';
import {
  CONTROLES_DE_VERIFICACION,
  ESPECIALIDADES,
  type EstadoDeVerificacion,
} from '../../../dominio/valores-cerrados.js';
import type { Verificacion } from '../../../dominio/verificacion.js';
import { cuidadores, verificaciones } from './directorio.esquema.js';
import { cuidadorDeFila, verificacionDeFila } from './mapeadores.js';

// La calificación con la que se ordena: el promedio con un decimal, y 0 si todavía no tiene reseñas. Es
// la MISMA cuenta que `Cuidador.calificacion()`, así el cursor (que guarda este valor) coincide.
const CALIFICACION_DE_ORDEN = sql`coalesce(round(${cuidadores.sumaCalificaciones}::numeric / nullif(${cuidadores.cantidadResenas}, 0), 1), 0)`;

// Para un `LIKE '%texto%'`: el texto de la persona nunca debe actuar como comodín.
function contiene(columna: PgColumn, texto: string): SQL {
  const escapado = texto.replace(/[\\%_]/g, '\\$&');
  return sql`${columna} like ${`%${escapado}%`} escape '\\'`;
}

export class RepositorioCuidadoresDrizzle implements RepositorioCuidadores {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(cuidador: Cuidador): Promise<void> {
    try {
      // Varias tablas, una sola unidad. La base exige (trigger) que un cuidador solo sea visible con sus
      // tres controles ya guardados: se inserta oculto, luego las verificaciones, y al final se marca visible.
      await this.contexto.ejecutar(async () => {
        const bd = this.contexto.conexion();
        await bd.insert(cuidadores).values({
          id: cuidador.id,
          usuarioId: cuidador.usuarioId,
          nombre: cuidador.nombre,
          nombreBusqueda: normalizarParaBuscar(cuidador.nombre),
          fotoUrl: cuidador.fotoUrl,
          especialidad: cuidador.especialidad,
          titulo: cuidador.titulo,
          aniosExperiencia: cuidador.aniosExperiencia,
          tarifaHora: cuidador.tarifaHora.valor,
          telefono: cuidador.telefono,
          zona: cuidador.zona,
          zonaBusqueda: normalizarParaBuscar(cuidador.zona),
          disponibilidad: [...cuidador.disponibilidad],
          bio: cuidador.bio,
          aceptacionAutomatica: cuidador.aceptacionAutomatica,
          estado: cuidador.estado,
          visible: false,
          sumaCalificaciones: cuidador.sumaCalificaciones,
          cantidadResenas: cuidador.cantidadResenas,
          serviciosCompletados: cuidador.serviciosCompletados,
          version: cuidador.version,
          creadoEn: cuidador.creadoEn,
          actualizadoEn: cuidador.actualizadoEn,
        });
        if (cuidador.verificaciones.length > 0) {
          await bd.insert(verificaciones).values(
            cuidador.verificaciones.map((v) => ({
              id: v.id,
              cuidadorId: v.cuidadorId,
              control: v.control,
              estado: v.estado,
              revisadoPor: v.revisadoPor,
              revisadoEn: v.revisadoEn,
              motivoRechazo: v.motivoDeRechazo,
              vigenteHasta: v.vigenteHasta?.aTexto() ?? null,
              creadoEn: v.creadoEn,
            })),
          );
        }
        if (cuidador.visible) {
          await bd
            .update(cuidadores)
            .set({ visible: true })
            .where(eq(cuidadores.id, cuidador.id));
        }
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error, 'cuidadores_usuario_unico')) {
        throw new ConflictoDeEstado(
          'Esa cuenta ya tiene un perfil de cuidador',
          'cuidador.usuario_ya_tiene_perfil',
        );
      }
      throw error;
    }
  }

  async actualizar(cuidador: Cuidador): Promise<void> {
    await this.contexto.ejecutar(async () => {
      const bd = this.contexto.conexion();
      const actualizados = await bd
        .update(cuidadores)
        .set({
          // Ocultar va en ESTA misma sentencia: si el estado deja de ser «activo» mientras la fila
          // sigue visible, el CHECK `cuidadores_visible_si_activo` la rechazaría. Ocultar no dispara el
          // trigger de verificaciones (solo mira filas que quedan visibles).
          ...(cuidador.visible ? {} : { visible: false }),
          // Lo que el propio cuidador edita en su perfil.
          fotoUrl: cuidador.fotoUrl,
          especialidad: cuidador.especialidad,
          titulo: cuidador.titulo,
          aniosExperiencia: cuidador.aniosExperiencia,
          tarifaHora: cuidador.tarifaHora.valor,
          telefono: cuidador.telefono,
          zona: cuidador.zona,
          zonaBusqueda: normalizarParaBuscar(cuidador.zona),
          disponibilidad: [...cuidador.disponibilidad],
          bio: cuidador.bio,
          estado: cuidador.estado,
          aceptacionAutomatica: cuidador.aceptacionAutomatica,
          sumaCalificaciones: cuidador.sumaCalificaciones,
          cantidadResenas: cuidador.cantidadResenas,
          serviciosCompletados: cuidador.serviciosCompletados,
          version: cuidador.version,
          actualizadoEn: cuidador.actualizadoEn,
        })
        .where(eq(cuidadores.id, cuidador.id))
        .returning({ id: cuidadores.id });
      if (actualizados.length === 0) {
        throw new RecursoNoEncontrado(
          'El cuidador no existe',
          'cuidador.no_encontrado',
        );
      }
      // Mostrar va aparte y solo si cambió: el trigger de la base revisa los controles cada vez que la
      // columna aparece en un UPDATE dejándola visible, y un simple cambio de contadores no debe fallar
      // porque un control venció (eso lo resuelve `recalcularVisibilidad`).
      if (cuidador.visible) {
        await bd
          .update(cuidadores)
          .set({ visible: true })
          .where(
            and(eq(cuidadores.id, cuidador.id), eq(cuidadores.visible, false)),
          );
      }
    });
  }

  async guardarVerificacion(verificacion: Verificacion): Promise<void> {
    const valores = {
      id: verificacion.id,
      cuidadorId: verificacion.cuidadorId,
      control: verificacion.control,
      estado: verificacion.estado,
      revisadoPor: verificacion.revisadoPor,
      revisadoEn: verificacion.revisadoEn,
      motivoRechazo: verificacion.motivoDeRechazo,
      vigenteHasta: verificacion.vigenteHasta?.aTexto() ?? null,
      creadoEn: verificacion.creadoEn,
    };
    try {
      await this.contexto
        .conexion()
        .insert(verificaciones)
        .values(valores)
        .onConflictDoUpdate({
          target: verificaciones.id,
          set: {
            estado: valores.estado,
            revisadoPor: valores.revisadoPor,
            revisadoEn: valores.revisadoEn,
            motivoRechazo: valores.motivoRechazo,
            vigenteHasta: valores.vigenteHasta,
          },
        });
    } catch (error) {
      // Tras este error la transacción en curso queda abortada: el caso de uso debe dejar que se revierta.
      if (esViolacionDeUnicidad(error, 'verificaciones_vigente_unica')) {
        throw new ConflictoDeEstado(
          'Ese control ya está en revisión o aprobado',
          'verificacion.ya_vigente',
        );
      }
      throw error;
    }
  }

  async buscarCuidadorDeVerificacion(
    id: VerificacionId,
  ): Promise<CuidadorId | null> {
    const filas = await this.contexto
      .conexion()
      .select({ cuidadorId: verificaciones.cuidadorId })
      .from(verificaciones)
      .where(eq(verificaciones.id, id))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : (fila.cuidadorId as CuidadorId);
  }

  async listarVerificaciones(
    estado: EstadoDeVerificacion,
    limite: number,
  ): Promise<FilaDeVerificacion[]> {
    const filas = await this.contexto
      .conexion()
      .select({ verificacion: verificaciones, cuidador: cuidadores })
      .from(verificaciones)
      .innerJoin(cuidadores, eq(cuidadores.id, verificaciones.cuidadorId))
      .where(eq(verificaciones.estado, estado))
      .orderBy(asc(verificaciones.creadoEn), asc(verificaciones.id))
      .limit(limite);
    return filas.map(({ verificacion, cuidador }) => {
      const especialidad = ESPECIALIDADES.find(
        (e) => e === cuidador.especialidad,
      );
      if (especialidad === undefined) {
        throw new Error(
          `Valor inesperado en la base de datos: especialidad = "${cuidador.especialidad}"`,
        );
      }
      return {
        verificacion: verificacionDeFila(verificacion),
        cuidador: {
          id: cuidador.id as CuidadorId,
          nombre: cuidador.nombre,
          especialidad,
          zona: cuidador.zona,
        },
      };
    });
  }

  buscarPorId(id: CuidadorId): Promise<Cuidador | null> {
    return this.buscar(id, false);
  }

  async buscarPorUsuarioId(usuarioId: string): Promise<Cuidador | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(cuidadores)
      .where(eq(cuidadores.usuarioId, usuarioId))
      .limit(1);
    const fila = filas[0];
    if (fila === undefined) return null;
    const porCuidador = await this.verificacionesDe([fila.id as CuidadorId]);
    return cuidadorDeFila(fila, porCuidador.get(fila.id as CuidadorId) ?? []);
  }

  buscarPorIdParaActualizar(id: CuidadorId): Promise<Cuidador | null> {
    return this.buscar(id, true);
  }

  private async buscar(
    id: CuidadorId,
    bloquear: boolean,
  ): Promise<Cuidador | null> {
    const consulta = this.contexto
      .conexion()
      .select()
      .from(cuidadores)
      .where(eq(cuidadores.id, id))
      .limit(1);
    // NO KEY UPDATE: la fila cambia (contadores, estado) pero nunca su clave.
    const filas = await (bloquear ? consulta.for('no key update') : consulta);
    const fila = filas[0];
    if (fila === undefined) return null;
    const porCuidador = await this.verificacionesDe([id]);
    return cuidadorDeFila(fila, porCuidador.get(id) ?? []);
  }

  async listarVisibles(
    filtros: FiltrosDeCuidadores,
    limite: number,
    cursor: CursorDeCuidadores | null,
  ): Promise<PaginaDeCuidadores> {
    const condiciones: (SQL | undefined)[] = [eq(cuidadores.visible, true)];
    if (filtros.busqueda !== undefined) {
      condiciones.push(
        sql`(${contiene(cuidadores.nombreBusqueda, filtros.busqueda)} or ${contiene(cuidadores.especialidad, filtros.busqueda)})`,
      );
    }
    if (filtros.especialidad !== undefined) {
      condiciones.push(eq(cuidadores.especialidad, filtros.especialidad));
    }
    if (filtros.zona !== undefined) {
      condiciones.push(contiene(cuidadores.zonaBusqueda, filtros.zona));
    }
    if (filtros.jornada !== undefined) {
      condiciones.push(
        sql`${cuidadores.disponibilidad} @> array[${filtros.jornada}]::text[]`,
      );
    }
    if (filtros.tarifaMaxima !== undefined) {
      condiciones.push(lte(cuidadores.tarifaHora, filtros.tarifaMaxima));
    }
    if (cursor !== null) {
      // Lo que va DESPUÉS de la última fila vista, en el orden de la búsqueda.
      condiciones.push(sql`(
        ${CALIFICACION_DE_ORDEN} < ${cursor.calificacion}::numeric
        or (${CALIFICACION_DE_ORDEN} = ${cursor.calificacion}::numeric and ${cuidadores.tarifaHora} > ${cursor.tarifaHora})
        or (${CALIFICACION_DE_ORDEN} = ${cursor.calificacion}::numeric and ${cuidadores.tarifaHora} = ${cursor.tarifaHora} and ${cuidadores.id} > ${cursor.id}::uuid)
      )`);
    }

    // Una fila de más para saber si hay otra página sin hacer una segunda consulta.
    const filas = await this.contexto
      .conexion()
      .select()
      .from(cuidadores)
      .where(and(...condiciones))
      .orderBy(
        desc(CALIFICACION_DE_ORDEN),
        asc(cuidadores.tarifaHora),
        asc(cuidadores.id),
      )
      .limit(limite + 1);

    const hayMas = filas.length > limite;
    const delaPagina = hayMas ? filas.slice(0, limite) : filas;
    const porCuidador = await this.verificacionesDe(
      delaPagina.map((fila) => fila.id as CuidadorId),
    );
    const lista = delaPagina.map((fila) =>
      cuidadorDeFila(fila, porCuidador.get(fila.id as CuidadorId) ?? []),
    );
    const ultimo = lista.at(-1);
    return {
      cuidadores: lista,
      siguiente:
        hayMas && ultimo !== undefined
          ? {
              calificacion: ultimo.calificacion() ?? 0,
              tarifaHora: ultimo.tarifaHora.valor,
              id: ultimo.id,
            }
          : null,
    };
  }

  async obtenerFiltrosDisponibles(): Promise<FiltrosDisponibles> {
    const bd = this.contexto.conexion();
    // Una sola forma de escribir cada zona (H9): se agrupa por el texto normalizado y se muestra una.
    const zonas = await bd
      .select({ zona: sql<string>`min(${cuidadores.zona})` })
      .from(cuidadores)
      .where(eq(cuidadores.visible, true))
      .groupBy(cuidadores.zonaBusqueda)
      .orderBy(sql`min(${cuidadores.zona})`);
    const [tarifa] = await bd
      .select({
        maxima: sql<number | null>`max(${cuidadores.tarifaHora})::int`,
      })
      .from(cuidadores)
      .where(eq(cuidadores.visible, true));
    return {
      zonas: zonas.map((fila) => fila.zona),
      tarifaMaxima: tarifa?.maxima ?? null,
    };
  }

  async listarIdsVisiblesConControlVencido(
    hoy: FechaCivil,
  ): Promise<CuidadorId[]> {
    const filas = await this.contexto
      .conexion()
      .select({ id: cuidadores.id })
      .from(cuidadores)
      .where(
        and(
          eq(cuidadores.visible, true),
          // Cuántos de los tres controles tiene hoy aprobados y vigentes (sin vencimiento, o con él en el futuro).
          sql`(
            select count(distinct v.control) from directorio.verificaciones v
            where v.cuidador_id = ${cuidadores.id}
              and v.estado = 'aprobada'
              and (v.vigente_hasta is null or v.vigente_hasta >= ${hoy.aTexto()}::date)
          ) < ${CONTROLES_DE_VERIFICACION.length}`,
        ),
      );
    return filas.map((fila) => fila.id as CuidadorId);
  }

  // Una verificación por control: la pendiente o la aprobada si la hay (la que cuenta para mostrar) y, si no, la más
  // reciente del historial (rechazada o vencida), para que el cuidador vea qué pasó con ella y pueda renovarla.
  private async verificacionesDe(
    ids: readonly CuidadorId[],
  ): Promise<Map<CuidadorId, Verificacion[]>> {
    const porCuidador = new Map<CuidadorId, Verificacion[]>();
    if (ids.length === 0) return porCuidador;
    const filas = await this.contexto
      .conexion()
      .select()
      .from(verificaciones)
      .where(inArray(verificaciones.cuidadorId, [...ids]))
      .orderBy(desc(verificaciones.creadoEn), desc(verificaciones.id));
    const elegidas = new Map<string, (typeof filas)[number]>();
    for (const fila of filas) {
      const clave = `${fila.cuidadorId}|${fila.control}`;
      const actual = elegidas.get(clave);
      const esVigente =
        fila.estado === 'pendiente' || fila.estado === 'aprobada';
      const actualEsVigente =
        actual !== undefined &&
        (actual.estado === 'pendiente' || actual.estado === 'aprobada');
      if (actual === undefined || (esVigente && !actualEsVigente)) {
        elegidas.set(clave, fila);
      }
    }
    for (const fila of elegidas.values()) {
      const cuidadorId = fila.cuidadorId as CuidadorId;
      const lista = porCuidador.get(cuidadorId) ?? [];
      lista.push(verificacionDeFila(fila));
      porCuidador.set(cuidadorId, lista);
    }
    return porCuidador;
  }
}
