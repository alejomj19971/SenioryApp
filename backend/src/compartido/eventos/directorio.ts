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

export type EventoDeDirectorio = CuidadorVisible | CuidadorOculto;
