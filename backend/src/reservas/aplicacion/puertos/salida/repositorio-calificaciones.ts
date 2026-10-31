import type { Calificacion } from '../../../dominio/calificacion.js';
import type { ServicioId } from '../../../dominio/ids.js';

export interface RepositorioCalificaciones {
  // Lanza ConflictoDeEstado (`calificacion.ya_existe`) si el servicio ya fue calificado. Tras el error la
  // transacción en curso queda abortada.
  guardar(calificacion: Calificacion): Promise<void>;

  buscarPorServicio(servicioId: ServicioId): Promise<Calificacion | null>;

  // Para armar una lista de servicios sin una consulta por cada uno.
  buscarPorServicios(
    servicioIds: readonly ServicioId[],
  ): Promise<Map<string, Calificacion>>;
}

export const REPOSITORIO_CALIFICACIONES = Symbol('RepositorioCalificaciones');
