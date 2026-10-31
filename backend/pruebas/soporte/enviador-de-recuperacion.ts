import type {
  EnviadorDeRecuperacion,
  MensajeDeRecuperacion,
} from '../../src/identidad/aplicacion/puertos/salida/enviador-de-recuperacion.js';

// Doble del canal de correo para las pruebas: guarda lo que se «envió» para poder abrir el enlace.
export class EnviadorDeRecuperacionEnMemoria implements EnviadorDeRecuperacion {
  disponible = true;
  // Para probar qué pasa cuando el canal falla.
  falla = false;
  readonly mensajes: MensajeDeRecuperacion[] = [];

  enviar(mensaje: MensajeDeRecuperacion): Promise<void> {
    if (this.falla) return Promise.reject(new Error('El canal no responde'));
    this.mensajes.push(mensaje);
    return Promise.resolve();
  }

  paraCorreo(correo: string): MensajeDeRecuperacion[] {
    return this.mensajes.filter((m) => m.correo === correo);
  }

  // El token que viajó en el enlace de un mensaje.
  static tokenDe(mensaje: MensajeDeRecuperacion): string {
    const token = new URL(mensaje.enlace).searchParams.get('token');
    if (token === null) throw new Error('El enlace no trae token');
    return token;
  }
}
