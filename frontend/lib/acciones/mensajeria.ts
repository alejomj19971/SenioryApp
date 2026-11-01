"use server";

import { redirect } from "next/navigation";
import { mensajeDeErrorDeServicio } from "@/lib/acciones/errores-de-servicio";
import type { EstadoDeFormulario } from "@/lib/acciones/estado";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { abrirConversacion, enviarMensaje, listarMensajes, type PaginaDeMensajes } from "@/lib/services/mensajeria";
import type { MensajeDeChat } from "@/lib/types";

// Acciones de mensajería (F8). Son endpoints públicos de Next: validan su entrada y el backend autoriza (quien no es
// parte de una conversación recibe 404, igual que si no existiera).

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LARGO_MAXIMO_DEL_TEXTO = 1000;
// Caracteres de control (menos el salto de línea y el tabulador): no caben en un mensaje.
const CARACTERES_DE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FORMATO_DE_CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

const MENSAJES: Record<string, string> = {
  "conversacion.sin_servicio_activo": "Ya no se puede escribir: el servicio terminó. Puedes leer lo que se escribió.",
};

function mensajeDeError(error: ErrorDeApi): string {
  return MENSAJES[error.codigo] ?? mensajeDeErrorDeServicio(error);
}

// «Escribir al cuidador»: abre (o recupera) la conversación y lleva a ella. Solo con un servicio vivo con él o ella.
export async function abrirConversacionAccion(cuidadorId: string): Promise<EstadoDeFormulario> {
  if (typeof cuidadorId !== "string" || !FORMATO_DE_UUID.test(cuidadorId)) return { mensaje: "No encontramos a ese cuidador." };
  const resultado = await abrirConversacion(cuidadorId);
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error.estado === 404 || resultado.error.estado === 422 || resultado.error.estado === 403
          ? "Solo puedes escribirle mientras tengas un servicio pedido con esa persona."
          : mensajeDeError(resultado.error),
    };
  }
  redirect(`/app/mensajes/${resultado.datos.id}`);
}

export type ResultadoDeEnvio = { ok: true; mensaje: MensajeDeChat } | { ok: false; mensaje: string };

// Envía un mensaje. `idDeCliente` lo genera la pantalla: reenviar el MISMO no lo duplica.
export async function enviarMensajeAccion(conversacionId: unknown, texto: unknown, idDeCliente: unknown): Promise<ResultadoDeEnvio> {
  if (typeof conversacionId !== "string" || !FORMATO_DE_UUID.test(conversacionId)) return { ok: false, mensaje: "No encontramos esa conversación." };
  if (typeof idDeCliente !== "string" || !FORMATO_DE_UUID.test(idDeCliente)) return { ok: false, mensaje: "No pudimos enviar el mensaje. Recarga la página." };
  if (typeof texto !== "string") return { ok: false, mensaje: "Escribe un mensaje." };
  const limpio = texto.trim();
  if (limpio === "") return { ok: false, mensaje: "Escribe un mensaje." };
  if ([...limpio].length > LARGO_MAXIMO_DEL_TEXTO) return { ok: false, mensaje: `El mensaje debe tener ${LARGO_MAXIMO_DEL_TEXTO} caracteres o menos.` };
  if (CARACTERES_DE_CONTROL.test(limpio)) return { ok: false, mensaje: "El mensaje tiene caracteres que no se pueden enviar." };

  const resultado = await enviarMensaje(conversacionId, limpio, idDeCliente);
  return resultado.ok ? { ok: true, mensaje: resultado.datos } : { ok: false, mensaje: mensajeDeError(resultado.error) };
}

export type ResultadoDeMensajes = { ok: true; pagina: PaginaDeMensajes } | { ok: false; mensaje: string };

// «Ver anteriores» y la actualización de respaldo cuando no hay conexión en vivo.
export async function cargarMensajesAccion(conversacionId: unknown, antes?: unknown): Promise<ResultadoDeMensajes> {
  if (typeof conversacionId !== "string" || !FORMATO_DE_UUID.test(conversacionId)) return { ok: false, mensaje: "No encontramos esa conversación." };
  if (antes !== undefined && (typeof antes !== "string" || !FORMATO_DE_CURSOR.test(antes))) return { ok: false, mensaje: "No pudimos cargar los mensajes. Recarga la página." };
  try {
    return { ok: true, pagina: await listarMensajes(conversacionId, antes) };
  } catch (error) {
    if (error instanceof ErrorDeApi) return { ok: false, mensaje: mensajeDeError(error) };
    throw error;
  }
}
