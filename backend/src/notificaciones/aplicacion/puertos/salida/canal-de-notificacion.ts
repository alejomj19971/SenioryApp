import type { Canal, Prioridad } from '../../../dominio/valores-cerrados.js';

export interface MensajeParaEnviar {
  destinatario: {
    usuarioId: string;
    nombre: string;
    correo: string;
    telefono: string | null;
  };
  titulo: string;
  cuerpo: string;
  prioridad: Prioridad;
}

// Lo que un canal responde cuando acepta el mensaje: `entregada` si ya llegó (la app), `enviada` si el
// proveedor lo aceptó y falta que confirme la entrega (correo, SMS, WhatsApp).
export type ResultadoDeEnvio = 'entregada' | 'enviada';

// Un canal que no pudo enviar. `definitivo` indica que reintentar no sirve (la persona no tiene teléfono): el
// aviso queda fallido de una vez en lugar de gastar los cinco intentos.
export class FalloDeEnvio extends Error {
  constructor(
    mensaje: string,
    readonly definitivo = false,
  ) {
    super(mensaje);
    this.name = 'FalloDeEnvio';
  }
}

// Un medio por el que sale un aviso. Los adaptadores son intercambiables: la aplicación (la app misma) y, cuando
// se elijan proveedores, correo, SMS y WhatsApp (decisión abierta). Un canal sin proveedor NO se registra:
// no se finge que existe.
export interface CanalDeNotificacion {
  readonly canal: Canal;

  // Lanza FalloDeEnvio si no pudo enviar; cualquier otro error se trata como fallo reintentable.
  enviar(mensaje: MensajeParaEnviar): Promise<ResultadoDeEnvio>;
}

// Todos los canales disponibles en este entorno.
export const CANALES_DE_NOTIFICACION = Symbol('CanalesDeNotificacion');
