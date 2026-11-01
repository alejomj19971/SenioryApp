// Despierta las conexiones en vivo de una persona para que revisen si hay mensajes nuevos. Es solo una ayuda para
// bajar la espera: cada conexión revisa por su cuenta cada pocos segundos, así que si el aviso no llega (otra
// instancia del servidor, un reinicio) no se pierde nada.
export interface AvisadorDeFlujos {
  avisarA(personaId: string): void;
}

export const AVISADOR_DE_FLUJOS = Symbol('AvisadorDeFlujos');
