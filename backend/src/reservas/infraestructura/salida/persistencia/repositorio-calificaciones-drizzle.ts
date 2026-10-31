import { eq, inArray } from 'drizzle-orm';
import { ConflictoDeEstado } from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioCalificaciones } from '../../../aplicacion/puertos/salida/repositorio-calificaciones.js';
import type { Calificacion } from '../../../dominio/calificacion.js';
import type { ServicioId } from '../../../dominio/ids.js';
import { calificacionDeFila } from './mapeadores.js';
import { calificaciones } from './reservas.esquema.js';

export class RepositorioCalificacionesDrizzle implements RepositorioCalificaciones {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(calificacion: Calificacion): Promise<void> {
    try {
      await this.contexto.conexion().insert(calificaciones).values({
        servicioId: calificacion.servicioId,
        familiarId: calificacion.familiarId,
        calificacion: calificacion.calificacion,
        comentario: calificacion.comentario,
        creadaEn: calificacion.creadaEn,
      });
    } catch (error) {
      // La clave primaria es el servicio: una calificación por servicio. Tras este error la transacción en
      // curso queda abortada: el caso de uso debe dejar que se revierta.
      if (esViolacionDeUnicidad(error, 'calificaciones_pkey')) {
        throw new ConflictoDeEstado(
          'Ese servicio ya fue calificado',
          'calificacion.ya_existe',
        );
      }
      throw error;
    }
  }

  async buscarPorServicio(
    servicioId: ServicioId,
  ): Promise<Calificacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(calificaciones)
      .where(eq(calificaciones.servicioId, servicioId))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : calificacionDeFila(fila);
  }

  async buscarPorServicios(
    servicioIds: readonly ServicioId[],
  ): Promise<Map<string, Calificacion>> {
    const resultado = new Map<string, Calificacion>();
    if (servicioIds.length === 0) return resultado;
    const filas = await this.contexto
      .conexion()
      .select()
      .from(calificaciones)
      .where(inArray(calificaciones.servicioId, [...servicioIds]));
    for (const fila of filas) {
      resultado.set(fila.servicioId, calificacionDeFila(fila));
    }
    return resultado;
  }
}
