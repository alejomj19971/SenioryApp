import type { Jornada } from '../../../../compartido/dominio/jornada.js';
import type { EstadoDeServicio } from '../../../dominio/valores-cerrados.js';

export interface ResumenDeServicio {
  id: string;
  familiarId: string;
  adultoMayorId: string;
  cuidadorId: string;
  estado: EstadoDeServicio;
  // "AAAA-MM-DD" en la zona del negocio.
  fecha: string;
  jornada: Jornada;
  horas: number;
}

export interface ParticipantesDelServicio {
  servicioId: string;
  // La cuenta del familiar que contrató.
  familiarId: string;
  cuidadorId: string;
  // La cuenta del cuidador; null si aún no tiene (solo ocurre con datos de desarrollo).
  cuidadorUsuarioId: string | null;
}

// Lo único de Reservas que otros módulos pueden usar. Son IDs y datos mínimos: ningún módulo recibe una entidad
// de dominio ni toca las tablas de `reservas`.
export interface ConsultaDeReservas {
  // Pagos, Notificaciones y Mensajería. Null si no existe.
  obtenerServicio(servicioId: string): Promise<ResumenDeServicio | null>;

  // Teleasistencia, en cada acceso: ¿este cuidador está atendiendo ahora a esta persona? Es verdadero con un
  // servicio en curso, o aceptado cuya franja contiene el momento actual. Un servicio terminado o cancelado
  // corta el acceso de inmediato.
  cuidadorTieneServicioActivo(
    cuidadorId: string,
    adultoMayorId: string,
  ): Promise<boolean>;

  // Teleasistencia: a quién avisar de una alerta además de la familia. El cuidador cuyo servicio (aceptado o en
  // curso) tiene hoy la franja de esta persona; null si nadie está con ella ahora.
  obtenerCuidadorEnTurno(
    adultoMayorId: string,
  ): Promise<{ cuidadorId: string; cuidadorUsuarioId: string | null } | null>;

  // Mensajería: ¿pueden escribirse esta familia y este cuidador? Es verdadero con un servicio entre ellos que
  // siga vivo (solicitado, aceptado o en curso). Uno terminado o cancelado ya no permite escribir; leer lo escrito
  // es otra cosa y no pasa por aquí. Se pregunta en CADA envío.
  hayServicioActivoEntre(
    familiarId: string,
    cuidadorId: string,
  ): Promise<boolean>;

  // Mensajería: quiénes pueden hablar en el chat de ese servicio. Null si no existe.
  obtenerParticipantes(
    servicioId: string,
  ): Promise<ParticipantesDelServicio | null>;
}

export const CONSULTA_DE_RESERVAS = Symbol('ConsultaDeReservas');
