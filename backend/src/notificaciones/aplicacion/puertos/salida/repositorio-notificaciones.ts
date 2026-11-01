import type {
  Notificacion,
  NotificacionId,
} from '../../../dominio/notificacion.js';
import type { Canal } from '../../../dominio/valores-cerrados.js';

export interface IntentoDeEnvio {
  resultado: 'exito' | 'error';
  // Lo que respondió el proveedor o el motivo del error; nunca el contenido del mensaje.
  respuesta: string | null;
  intentadoEn: Date;
}

export interface CursorDeNotificaciones {
  creadaEn: Date;
  id: string;
}

export interface PaginaDeNotificaciones {
  notificaciones: Notificacion[];
  siguiente: CursorDeNotificaciones | null;
}

export interface RepositorioNotificaciones {
  // Guarda los avisos nuevos. Los que ya existen (mismo evento, destinatario, tipo y canal) se omiten sin error:
  // reprocesar un evento no repite el aviso. Devuelve cuántos eran nuevos.
  crear(notificaciones: readonly Notificacion[]): Promise<number>;

  // Toma hasta `limite` avisos pendientes que ya les toca, y los reserva por `reservaMs` para quien los tomó:
  // si el proceso muere a mitad del envío, otro los toma al vencer la reserva. Varias instancias pueden correr a
  // la vez (FOR UPDATE SKIP LOCKED) sin tomar el mismo aviso.
  reclamarPendientes(
    ahora: Date,
    limite: number,
    reservaMs: number,
  ): Promise<Notificacion[]>;

  // Guarda el resultado de un intento: el nuevo estado del aviso y una fila en el historial de intentos.
  registrarIntento(
    notificacion: Notificacion,
    intento: IntentoDeEnvio,
  ): Promise<void>;

  // Los demás canales del mismo aviso (mismo evento, destinatario y tipo), incluida ella misma. Para saber si una
  // alerta llegó por alguno.
  delMismoAviso(notificacion: Notificacion): Promise<Notificacion[]>;

  // Cuántos avisos se le crearon a esta persona desde `desde` (para el límite de envíos).
  contarRecientes(destinatarioId: string, desde: Date): Promise<number>;

  // ¿Se le creó a esta persona, desde `desde`, un aviso de ese tipo sobre esa misma conversación? Para agrupar los
  // avisos de mensajes: un chat animado avisa una vez, no por cada mensaje.
  existeAvisoDeConversacion(
    destinatarioId: string,
    tipo: string,
    conversacionId: string,
    desde: Date,
  ): Promise<boolean>;

  // Los avisos de una persona por un canal, los más recientes primero.
  listarDe(
    destinatarioId: string,
    canal: Canal,
    limite: number,
    cursor: CursorDeNotificaciones | null,
  ): Promise<PaginaDeNotificaciones>;

  buscarPorId(id: NotificacionId): Promise<Notificacion | null>;
}

export const REPOSITORIO_NOTIFICACIONES = Symbol('RepositorioNotificaciones');
