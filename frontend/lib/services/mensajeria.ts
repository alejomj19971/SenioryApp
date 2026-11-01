import "server-only";
import {
  abrirFlujoDelBackend,
  escribirEnBackend,
  leerDelBackend,
  type ResultadoDeEscritura,
} from "@/lib/api/cliente-servidor";
import type {
  ConversacionDelBackend,
  MensajeDelBackend,
  PaginaDeMensajesDelBackend,
  RespuestaDeConversacion,
  RespuestaDeConversaciones,
  RespuestaDeMensaje,
} from "@/lib/api/contratos/mensajeria";
import type { Conversacion, MensajeDeChat } from "@/lib/types";

// Mensajería (M8) sobre la API: el chat entre una familia y un cuidador. Solo las dos partes, texto plano, y solo se
// escribe mientras haya un servicio vivo entre ellas (leer lo escrito siempre se puede). Es la misma para los dos roles:
// el backend sabe quién es cada uno por su sesión.

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_DE_CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

function aConversacion(c: ConversacionDelBackend): Conversacion {
  return {
    id: c.id,
    otraParte: { nombre: c.otraParte.nombre, foto: c.otraParte.fotoUrl ?? "" },
    ultimoMensajeEn: c.ultimoMensajeEn,
    puedeEscribir: c.puedeEscribir,
  };
}

export function aMensajeDeChat(m: MensajeDelBackend): MensajeDeChat {
  return {
    id: m.id,
    ...(m.idDeCliente === undefined ? {} : { idDeCliente: m.idDeCliente }),
    autor: m.autor,
    texto: m.texto,
    enviadoEn: m.enviadoEn,
    estado: "enviado",
  };
}

// Mis conversaciones, la de la última charla primero.
export async function listarConversaciones(): Promise<Conversacion[]> {
  const { conversaciones } = await leerDelBackend<RespuestaDeConversaciones>("/conversaciones");
  return conversaciones.map(aConversacion);
}

// Null si no existe **o no es mía** (el backend responde 404 igual en los dos casos). No hay ruta para pedir una sola:
// se busca entre las mías.
export async function obtenerConversacion(id: string): Promise<Conversacion | null> {
  if (!FORMATO_DE_UUID.test(id)) return null;
  return (await listarConversaciones()).find((conversacion) => conversacion.id === id) ?? null;
}

// Abre (o recupera) la conversación con un cuidador. Solo las familias, y solo con un servicio vivo con él o ella.
export async function abrirConversacion(cuidadorId: string): Promise<ResultadoDeEscritura<Conversacion>> {
  const resultado = await escribirEnBackend<RespuestaDeConversacion>("/conversaciones", { metodo: "POST", cuerpo: { cuidadorId } });
  return resultado.ok ? { ok: true, datos: aConversacion(resultado.datos.conversacion) } : resultado;
}

export interface PaginaDeMensajes {
  // De los más antiguos a los más recientes (el orden de un chat).
  mensajes: MensajeDeChat[];
  // Para pedir los anteriores; null si no hay más.
  anteriores: string | null;
}

export async function listarMensajes(conversacionId: string, antes?: string, limite = 50): Promise<PaginaDeMensajes> {
  const consulta: Record<string, string> = { limite: String(limite) };
  if (antes !== undefined && FORMATO_DE_CURSOR.test(antes)) consulta.antes = antes;
  const pagina = await leerDelBackend<PaginaDeMensajesDelBackend>(`/conversaciones/${conversacionId}/mensajes`, { consulta });
  return { mensajes: pagina.mensajes.map(aMensajeDeChat).reverse(), anteriores: pagina.siguiente };
}

// Envía un mensaje. `idDeCliente` lo genera la pantalla para cada mensaje: reenviar el MISMO (mala conexión, doble
// toque) devuelve el mismo mensaje y no lo duplica, aunque el servicio haya terminado en el medio.
export async function enviarMensaje(conversacionId: string, texto: string, idDeCliente: string): Promise<ResultadoDeEscritura<MensajeDeChat>> {
  const resultado = await escribirEnBackend<RespuestaDeMensaje>(`/conversaciones/${conversacionId}/mensajes`, {
    metodo: "POST",
    cuerpo: { texto, idDeCliente },
  });
  return resultado.ok ? { ok: true, datos: aMensajeDeChat(resultado.datos.mensaje) } : resultado;
}

export type ResultadoDelFlujo =
  | { tipo: "flujo"; cuerpo: ReadableStream<Uint8Array> }
  | { tipo: "sin_sesion" }
  | { tipo: "no_valido" }
  | { tipo: "demasiadas" }
  | { tipo: "fallo" };

// Abre los eventos en vivo del backend (los mensajes nuevos de todas mis conversaciones). `ultimoEvento` retoma desde
// donde se quedó la persona (el backend entrega al menos una vez: la pantalla reconoce los mensajes por su id).
export async function abrirFlujoDeEventos(ultimoEvento: string | undefined, senal: AbortSignal): Promise<ResultadoDelFlujo> {
  if (ultimoEvento !== undefined && !FORMATO_DE_CURSOR.test(ultimoEvento)) return { tipo: "no_valido" };
  let respuesta: Response;
  try {
    respuesta = await abrirFlujoDelBackend("/mensajeria/eventos", { ...(ultimoEvento === undefined ? {} : { ultimoEvento }), senal });
  } catch {
    return { tipo: "fallo" };
  }
  if (respuesta.status === 401) return { tipo: "sin_sesion" };
  if (respuesta.status === 400) return { tipo: "no_valido" };
  if (respuesta.status === 429) return { tipo: "demasiadas" };
  if (!respuesta.ok || respuesta.body === null) return { tipo: "fallo" };
  return { tipo: "flujo", cuerpo: respuesta.body };
}
