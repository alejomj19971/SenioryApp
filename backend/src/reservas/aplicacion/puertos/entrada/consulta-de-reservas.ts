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

  // Mensajería: quiénes pueden hablar en el chat de ese servicio. Null si no existe.
  obtenerParticipantes(
    servicioId: string,
  ): Promise<ParticipantesDelServicio | null>;
}

export const CONSULTA_DE_RESERVAS = Symbol('ConsultaDeReservas');
