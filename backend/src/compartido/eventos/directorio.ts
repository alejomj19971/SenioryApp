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

// Un administrador suspendió a un cuidador. Reservas cancela sus servicios que aún no empezaron (solicitado o aceptado), Pagos
// devuelve el dinero e Identidad le bloquea la cuenta (no puede iniciar sesión). Va junto a `cuidador_oculto`, que solo dice
// que dejó de mostrarse: esto es una decisión, y otras causas de ocultarlo (un control vencido) NO cancelan servicios ni
// bloquean la cuenta. `usuarioId` es la cuenta del cuidador en Identidad (null si todavía no tiene).
export type CuidadorSuspendido = EventoDeIntegracion<
  'directorio.cuidador_suspendido',
  { cuidadorId: string; usuarioId: string | null }
>;

// Un administrador devolvió al directorio a un cuidador suspendido. Identidad le reabre la cuenta. Los servicios que se
// cancelaron al suspenderlo NO se restablecen. Que el cuidador vuelva a mostrarse lo dice `cuidador_visible`.
export type CuidadorReactivado = EventoDeIntegracion<
  'directorio.cuidador_reactivado',
  { cuidadorId: string; usuarioId: string | null }
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
  | CuidadorVisible
  | CuidadorOculto
  | CuidadorSuspendido
  | CuidadorReactivado
  | CuidadorVerificado
  | VerificacionRechazada;
