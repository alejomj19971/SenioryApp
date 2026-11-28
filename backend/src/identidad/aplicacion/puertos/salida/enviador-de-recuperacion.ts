export interface MensajeDeRecuperacion {
  nombre: string;
  correo: string;
  // El enlace que lleva el token. Es un secreto: no se registra en logs ni en eventos.
  enlace: string;
  expiraEn: Date;
}

// El enlace que llega al correo para confirmar que es de la persona. Misma forma que el de recuperación.
export type MensajeDeVerificacion = MensajeDeRecuperacion;

// Entrega el enlace para recuperar la contraseña por un canal que solo la persona controla (su
// correo). Es también el canal del enlace de verificación del correo: los dos son «un enlace de un solo uso que viaja
// por el correo de la persona», y salen por el mismo proveedor. El canal real llega con Notificaciones (M5); hasta entonces, fuera de desarrollo, no hay
// canal y la recuperación responde «no disponible» en vez de fingir que envió algo.
export interface EnviadorDeRecuperacion {
  // Falso si no hay un canal que entregue el enlace.
  readonly disponible: boolean;
  enviar(mensaje: MensajeDeRecuperacion): Promise<void>;
  // El enlace para confirmar el correo. Misma disponibilidad que `enviar`.
  enviarVerificacion(mensaje: MensajeDeVerificacion): Promise<void>;
}

export const ENVIADOR_DE_RECUPERACION = Symbol('EnviadorDeRecuperacion');
