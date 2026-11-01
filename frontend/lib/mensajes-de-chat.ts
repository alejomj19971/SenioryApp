import type { MensajeDeChat } from "@/lib/types";

// Mezcla mensajes en la conversación que se ve (F8). Sin `server-only`: lo usa el chat (cliente) y las pruebas.
//
// El backend entrega los mensajes AL MENOS UNA VEZ (por el flujo en vivo, por la lista o por la respuesta de enviar), así
// que el mismo mensaje puede llegar varias veces: se reconoce por su `id` y no se repite. Un mensaje que acabo de
// escribir existe primero como «local» (id `local-<idDeCliente>`); cuando llega el del servidor con ese `idDeCliente`,
// el local se sustituye, nunca se duplica.

export const idLocalDe = (idDeCliente: string) => `local-${idDeCliente}`;

export function fusionarMensajes(actuales: readonly MensajeDeChat[], nuevos: readonly MensajeDeChat[]): MensajeDeChat[] {
  const porId = new Map(actuales.map((mensaje) => [mensaje.id, mensaje] as const));
  for (const nuevo of nuevos) {
    if (nuevo.idDeCliente !== undefined) porId.delete(idLocalDe(nuevo.idDeCliente));
    porId.set(nuevo.id, nuevo);
  }
  return [...porId.values()].sort((a, b) => a.enviadoEn.localeCompare(b.enviadoEn) || a.id.localeCompare(b.id));
}

export function marcarFallido(actuales: readonly MensajeDeChat[], idDeCliente: string): MensajeDeChat[] {
  return actuales.map((mensaje) => (mensaje.id === idLocalDe(idDeCliente) ? { ...mensaje, estado: "fallido" as const } : mensaje));
}

export function marcarEnviando(actuales: readonly MensajeDeChat[], idDeCliente: string): MensajeDeChat[] {
  return actuales.map((mensaje) => (mensaje.id === idLocalDe(idDeCliente) ? { ...mensaje, estado: "enviando" as const } : mensaje));
}

export function quitarLocal(actuales: readonly MensajeDeChat[], idDeCliente: string): MensajeDeChat[] {
  return actuales.filter((mensaje) => mensaje.id !== idLocalDe(idDeCliente));
}
