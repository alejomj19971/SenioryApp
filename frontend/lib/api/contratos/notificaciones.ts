// Lo que el backend RESPONDE en Notificaciones (M5). Contrato de lo que el frontend lee; lo vigilan las pruebas de
// contrato contra el backend local. Cada persona ve SOLO los suyos (el destinatario sale de la sesión).

export interface AvisoDelBackend {
  id: string;
  // «evento:rol», por ejemplo «servicio_confirmado:familia» o «mensaje_nuevo:destinatario».
  tipo: string;
  titulo: string;
  cuerpo: string;
  prioridad: "normal" | "alta";
  creadaEn: string;
}

// `GET /notificaciones`: del más reciente al más antiguo.
export interface PaginaDeAvisosDelBackend {
  notificaciones: AvisoDelBackend[];
  // Para pedir los siguientes (`?cursor=`); null si no hay más.
  siguiente: string | null;
}
