import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { CursorDeServicios } from '../../../dominio/cursor-de-servicios.js';
import type { ServicioId } from '../../../dominio/ids.js';
import type { Servicio } from '../../../dominio/servicio.js';
import type { EstadoDeServicio } from '../../../dominio/valores-cerrados.js';

export interface PaginaDeServicios {
  servicios: Servicio[];
  // Desde dónde seguir; null si ya no hay más.
  siguiente: CursorDeServicios | null;
}

export interface FiltroDeServicios {
  estado?: EstadoDeServicio;
}

// Quién pregunta: sus servicios son los suyos como familiar o como cuidador.
export type DuenoDeServicios =
  | { tipo: 'familiar'; familiarId: string }
  | { tipo: 'cuidador'; cuidadorId: string };

export interface RepositorioServicios {
  // Guarda un servicio nuevo y su historial. Lanza ConflictoDeEstado con `servicio.franja_ocupada` si el
  // cuidador ya tiene un servicio activo en esa fecha y franja, o `servicio.clave_repetida` si esa familia ya
  // usó esa clave de idempotencia. Tras cualquiera de los dos la transacción en curso queda abortada.
  guardar(servicio: Servicio): Promise<void>;

  // Guarda los cambios de un servicio leído antes, con bloqueo optimista: si otra persona lo cambió en el
  // medio lanza ConflictoDeEstado (`servicio.modificado`). Escribe también las filas nuevas del historial.
  actualizar(servicio: Servicio): Promise<void>;

  buscarPorId(id: ServicioId): Promise<Servicio | null>;

  // Igual, pero bloquea la fila hasta que termine la transacción: dos acciones sobre el mismo servicio se
  // atienden una tras otra. Debe llamarse dentro de una unidad de trabajo.
  buscarPorIdParaActualizar(id: ServicioId): Promise<Servicio | null>;

  // Para que un reintento con la misma clave devuelva el mismo servicio.
  buscarPorClave(
    familiarId: string,
    claveDeIdempotencia: string,
  ): Promise<Servicio | null>;

  // Los más recientes primero, paginados por cursor.
  listarDe(
    dueno: DuenoDeServicios,
    filtro: FiltroDeServicios,
    limite: number,
    cursor: CursorDeServicios | null,
  ): Promise<PaginaDeServicios>;

  // Solicitudes pendientes cuyo plazo ya venció (para la tarea de expiración).
  listarSolicitudesVencidas(ahora: Date, limite: number): Promise<ServicioId[]>;

  // ¿Hay un servicio vivo (solicitado, aceptado o en curso) entre esta familia y este cuidador?
  existeActivoEntre(familiarId: string, cuidadorId: string): Promise<boolean>;

  // Servicios aceptados o en curso de una persona mayor desde esa fecha (para «cuidador en turno» y para saber
  // si un cuidador tiene servicio activo con ella). El filtro fino por franja lo hace el dominio.
  listarActivosDeAdultoMayor(
    adultoMayorId: string,
    desde: FechaCivil,
  ): Promise<Servicio[]>;
}

export const REPOSITORIO_SERVICIOS = Symbol('RepositorioServicios');
