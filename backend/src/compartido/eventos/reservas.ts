import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Reservas. Solo IDs y valores cerrados: nunca nombres, teléfonos ni
// comentarios (salvo el de la reseña, que la propia persona decidió publicar). Quien necesite más datos
// consulta a Reservas por su puerto de entrada.

// La familia pidió un servicio y espera la respuesta del cuidador (o se confirmó solo, si el cuidador tiene la
// aceptación automática: en ese caso sigue un `ServicioConfirmado`).
export type ServicioSolicitado = EventoDeIntegracion<
  'reservas.servicio_solicitado',
  {
    servicioId: string;
    familiarId: string;
    cuidadorId: string;
    adultoMayorId: string;
  }
>;

// El servicio quedó confirmado: el cuidador aceptó o se aceptó automáticamente. Pagos cobra aquí (M7).
export type ServicioConfirmado = EventoDeIntegracion<
  'reservas.servicio_confirmado',
  {
    servicioId: string;
    familiarId: string;
    cuidadorId: string;
    adultoMayorId: string;
  }
>;

// El cuidador empezó el servicio.
export type ServicioIniciado = EventoDeIntegracion<
  'reservas.servicio_iniciado',
  {
    servicioId: string;
    familiarId: string;
    cuidadorId: string;
    adultoMayorId: string;
  }
>;

// El servicio terminó: habilita la calificación y la liquidación al cuidador (M7).
export type ServicioFinalizado = EventoDeIntegracion<
  'reservas.servicio_finalizado',
  {
    servicioId: string;
    familiarId: string;
    cuidadorId: string;
    adultoMayorId: string;
  }
>;

export const MOTIVOS_DE_CANCELACION = [
  'rechazada', // el cuidador dijo que no
  'expirada', // el cuidador no respondió a tiempo
  'cancelada_por_familia', // la familia canceló
] as const;
export type MotivoDeCancelacion = (typeof MOTIVOS_DE_CANCELACION)[number];

// El servicio no se va a prestar. Pagos decide si hay reembolso (M7) y Notificaciones avisa.
export type ServicioCancelado = EventoDeIntegracion<
  'reservas.servicio_cancelado',
  {
    servicioId: string;
    familiarId: string;
    cuidadorId: string;
    adultoMayorId: string;
    motivo: MotivoDeCancelacion;
    // Cuántas horas faltaban para el servicio al cancelar, o null si no aplica; la política de reembolso (M7) la usa.
    horasDeAnticipacion: number | null;
  }
>;

// La familia calificó un servicio terminado. El comentario es texto que la propia persona decidió publicar
// en el perfil del cuidador, por eso es de los pocos textos libres que viajan en un evento. Directorio lo
// consume para crear la reseña.
export type ServicioCalificado = EventoDeIntegracion<
  'reservas.servicio_calificado',
  {
    servicioId: string;
    cuidadorId: string;
    familiarId: string;
    calificacion: number;
    comentario: string | null;
  }
>;

export type EventoDeReservas =
  | ServicioSolicitado
  | ServicioConfirmado
  | ServicioIniciado
  | ServicioFinalizado
  | ServicioCancelado
  | ServicioCalificado;
