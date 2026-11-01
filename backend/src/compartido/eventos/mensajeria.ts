import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Mensajería. Solo IDs: el texto de un mensaje nunca viaja en un evento (es una
// conversación privada entre dos personas; quien necesite leerla la pide a Mensajería con su sesión).

// Alguien escribió. Notificaciones decide si avisa a la otra parte, y avisa a lo sumo una vez por rato por
// conversación (si no, un chat animado inundaría de avisos).
export type MensajeEnviado = EventoDeIntegracion<
  'mensajeria.mensaje_enviado',
  {
    mensajeId: string;
    conversacionId: string;
    autorId: string;
    // La cuenta de quien debe enterarse; null si la otra parte aún no tiene cuenta (solo datos de desarrollo).
    destinatarioId: string | null;
  }
>;

export type EventoDeMensajeria = MensajeEnviado;
