// Lo que el backend RESPONDE en Mensajería (M8). Contrato de lo que el frontend lee; lo vigilan las pruebas de
// contrato contra el backend local. Solo las dos partes de una conversación la ven (un tercero recibe 404); de la otra
// parte solo salen el nombre y la foto: ni teléfono ni correo.

export interface ConversacionDelBackend {
  id: string;
  otraParte: { nombre: string; fotoUrl: string | null };
  ultimoMensajeEn: string | null;
  // Solo se escribe mientras haya un servicio vivo entre las dos partes; leer lo escrito siempre se puede.
  puedeEscribir: boolean;
}

export interface MensajeDelBackend {
  id: string;
  conversacionId: string;
  autor: "yo" | "otro";
  // Texto plano: nunca se interpreta como HTML.
  texto: string;
  enviadoEn: string;
  // Solo los míos lo traen.
  idDeCliente?: string;
}

// `GET /conversaciones/:id/mensajes`: del más reciente al más antiguo.
export interface PaginaDeMensajesDelBackend {
  mensajes: MensajeDelBackend[];
  // Para pedir los anteriores (`?antes=`); null si no hay más.
  siguiente: string | null;
}

export interface RespuestaDeConversacion {
  conversacion: ConversacionDelBackend;
}
export interface RespuestaDeConversaciones {
  conversaciones: ConversacionDelBackend[];
}
export interface RespuestaDeMensaje {
  mensaje: MensajeDelBackend;
}
