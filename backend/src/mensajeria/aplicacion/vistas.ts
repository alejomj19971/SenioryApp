import type { Mensaje } from '../dominio/mensaje.js';

// Lo que sale hacia la interfaz. Listas blancas: ningún teléfono, correo ni id de cuenta de la otra parte.

export interface VistaDeConversacion {
  id: string;
  // Con quién se habla. Solo el nombre y la foto.
  otraParte: { nombre: string; fotoUrl: string | null };
  ultimoMensajeEn: string | null;
  // ¿Se puede escribir ahora? Solo con un servicio vivo entre las dos partes; leer lo anterior siempre se puede.
  puedeEscribir: boolean;
}

export interface VistaDeMensaje {
  id: string;
  conversacionId: string;
  // «yo» o «otro», visto por quien lo pide: la interfaz no tiene que comparar ids de cuentas.
  autor: 'yo' | 'otro';
  texto: string;
  enviadoEn: string;
  // Solo en los míos: para reconocer en la lista el mensaje que acabo de enviar.
  idDeCliente?: string;
}

export function vistaDeMensaje(
  mensaje: Mensaje,
  personaId: string,
): VistaDeMensaje {
  const esMio = mensaje.autorId === personaId;
  return {
    id: mensaje.id,
    conversacionId: mensaje.conversacionId,
    autor: esMio ? 'yo' : 'otro',
    texto: mensaje.texto,
    enviadoEn: mensaje.creadoEn.toISOString(),
    ...(esMio ? { idDeCliente: mensaje.idDeCliente } : {}),
  };
}
