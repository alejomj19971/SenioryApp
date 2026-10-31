import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Notificaciones.

// Un aviso de una alerta llegó (o el proveedor lo aceptó) por un canal. Teleasistencia lo usa para marcar la
// alerta como «notificada» y medir cuánto tardó la primera entrega (E11). Solo se publica para los avisos de
// alertas, no para todos.
export type NotificacionEntregada = EventoDeIntegracion<
  'notificaciones.notificacion_entregada',
  {
    notificacionId: string;
    destinatarioId: string;
    canal: string;
    // La alerta que originó el aviso.
    alertaId: string;
    // Cuándo salió, en ISO 8601.
    entregadaEn: string;
  }
>;
