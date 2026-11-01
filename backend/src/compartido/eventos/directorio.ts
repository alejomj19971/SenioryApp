import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Directorio. Solo IDs.

// Un cuidador pasó a mostrarse en las búsquedas (tiene sus tres controles aprobados y vigentes).
export type CuidadorVisible = EventoDeIntegracion<
  'directorio.cuidador_visible',
  { cuidadorId: string }
>;

// Un cuidador dejó de mostrarse (se venció un control o lo suspendieron). Reservas revisa sus servicios
// futuros con este aviso.
export type CuidadorOculto = EventoDeIntegracion<
  'directorio.cuidador_oculto',
  { cuidadorId: string }
>;

// Un revisor aprobó los tres controles de un cuidador que se postuló: ya es parte del directorio. Notificaciones se
// lo avisa a él.
export type CuidadorVerificado = EventoDeIntegracion<
  'directorio.cuidador_verificado',
  { cuidadorId: string }
>;

// Un revisor rechazó un control. El cuidador ve el motivo en su perfil; Notificaciones le avisa que mire. El motivo
// NO viaja en el evento (solo ids y valores cerrados).
export type VerificacionRechazada = EventoDeIntegracion<
  'directorio.verificacion_rechazada',
  { cuidadorId: string; control: string }
>;

export type EventoDeDirectorio =
  CuidadorVisible | CuidadorOculto | CuidadorVerificado | VerificacionRechazada;
