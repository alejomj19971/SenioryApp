import { Logger } from '@nestjs/common';
import {
  FalloDeEnvio,
  type CanalDeNotificacion,
  type MensajeParaEnviar,
  type ResultadoDeEnvio,
} from '../../../aplicacion/puertos/salida/canal-de-notificacion.js';
import type { Canal } from '../../../dominio/valores-cerrados.js';

// El aviso dentro de la aplicación. No necesita proveedor: el aviso guardado ES el mensaje, y la persona lo ve en
// su campana (`GET /notificaciones`). Es el único canal real que hay hoy; los demás esperan la decisión de
// proveedores y no se registran mientras tanto.
export class CanalDeApp implements CanalDeNotificacion {
  readonly canal = 'app';

  enviar(): Promise<ResultadoDeEnvio> {
    return Promise.resolve('entregada');
  }
}

// SOLO PARA DESARROLLO Y PRUEBAS: finge ser correo, SMS, WhatsApp o push. Registra en el log que "enviaría" el
// aviso (solo su título, nunca el cuerpo) y responde que el proveedor lo aceptó. La configuración rechaza
// arrancar en producción con canales simulados: un aviso que no sale no puede darse por enviado.
export class CanalSimulado implements CanalDeNotificacion {
  private readonly registroDeLog = new Logger('CanalSimulado');

  constructor(readonly canal: Canal) {}

  enviar(mensaje: MensajeParaEnviar): Promise<ResultadoDeEnvio> {
    if (
      (this.canal === 'sms' || this.canal === 'whatsapp') &&
      mensaje.destinatario.telefono === null
    ) {
      // Sin teléfono, reintentar no arregla nada.
      return Promise.reject(
        new FalloDeEnvio('La persona no tiene teléfono registrado', true),
      );
    }
    this.registroDeLog.log(
      `[simulado:${this.canal}] a ${mensaje.destinatario.usuarioId}: ${mensaje.titulo}`,
    );
    return Promise.resolve('enviada');
  }
}
