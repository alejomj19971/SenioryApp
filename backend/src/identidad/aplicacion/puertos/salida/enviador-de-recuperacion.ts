export interface MensajeDeRecuperacion {
  nombre: string;
  correo: string;
  // El enlace que lleva el token. Es un secreto: no se registra en logs ni en eventos.
  enlace: string;
  expiraEn: Date;
}

// Entrega el enlace para recuperar la contraseña por un canal que solo la persona controla (su
// correo). El canal real llega con Notificaciones (M5); hasta entonces, fuera de desarrollo, no hay
// canal y la recuperación responde «no disponible» en vez de fingir que envió algo.
export interface EnviadorDeRecuperacion {
  // Falso si no hay un canal que entregue el enlace.
  readonly disponible: boolean;
  enviar(mensaje: MensajeDeRecuperacion): Promise<void>;
}

export const ENVIADOR_DE_RECUPERACION = Symbol('EnviadorDeRecuperacion');
