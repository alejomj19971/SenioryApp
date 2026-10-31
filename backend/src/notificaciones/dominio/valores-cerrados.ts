// Valores con un conjunto cerrado de opciones. Son los mismos que los CHECK de la base de datos: agregar uno
// implica una migración nueva, y una prueba compara estas constantes con los CHECK.

export const CANALES = ['app', 'correo', 'sms', 'whatsapp', 'push'] as const;
export type Canal = (typeof CANALES)[number];

export const PRIORIDADES = ['normal', 'alta'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

// pendiente → (enviada | entregada | fallida). «Enviada»: el proveedor aceptó el mensaje y falta que confirme la
// entrega; «entregada»: llegó (en la app, al guardarse; en los demás canales, cuando el proveedor lo confirme).
export const ESTADOS_DE_NOTIFICACION = [
  'pendiente',
  'enviada',
  'entregada',
  'fallida',
] as const;
export type EstadoDeNotificacion = (typeof ESTADOS_DE_NOTIFICACION)[number];

// Los datos que acompañan a un aviso para armar su texto. Solo valores simples y nunca datos clínicos
// (minimización, Ley 1581): fechas, franjas, horas y motivos.
export type Parametros = Record<string, string | number | boolean | null>;
