import { Logger } from '@nestjs/common';
import type {
  EnviadorDeRecuperacion,
  MensajeDeRecuperacion,
} from '../../../aplicacion/puertos/salida/enviador-de-recuperacion.js';

// SOLO PARA DESARROLLO Y PRUEBAS: escribe el enlace en el log del servidor para poder seguir el flujo
// sin un servicio de correo. En producción no se admite (la configuración lo rechaza al arrancar): un
// enlace de recuperación en un log sería un acceso a la cuenta para quien lea los logs.
export class EnviadorDeRecuperacionEnConsola implements EnviadorDeRecuperacion {
  readonly disponible = true;
  private readonly registro = new Logger('Recuperacion');

  enviar(mensaje: MensajeDeRecuperacion): Promise<void> {
    this.registro.warn(
      `[SOLO DESARROLLO] Enlace de recuperación para ${mensaje.correo}: ${mensaje.enlace}`,
    );
    return Promise.resolve();
  }
}

// Mientras no haya un canal real de correo (M5): la recuperación responde «no disponible» en lugar de
// fingir que envió algo. Es lo que corre en producción hasta entonces.
export class EnviadorDeRecuperacionDeshabilitado implements EnviadorDeRecuperacion {
  readonly disponible = false;

  enviar(): Promise<void> {
    return Promise.reject(
      new Error(
        'No hay un canal configurado para enviar enlaces de recuperación',
      ),
    );
  }
}
