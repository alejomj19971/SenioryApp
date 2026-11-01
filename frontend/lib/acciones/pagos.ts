"use server";

import { revalidatePath } from "next/cache";
import { mensajeDeErrorDeServicio } from "@/lib/acciones/errores-de-servicio";
import { comprarPaquete, obtenerEnlaceDePago } from "@/lib/services/pagos";

// Acciones de pagos (F7). Endpoints públicos de Next: validan su entrada y el backend autoriza (un pago ajeno
// responde 404). El monto NUNCA viene del navegador: solo se dice qué paquete.

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_DE_CODIGO = /^[a-z0-9][a-z0-9-]{0,49}$/;

export type ResultadoDeEnlace = { ok: true; url: string } | { ok: false; mensaje: string };

// Solo se manda a una dirección http(s): la respuesta del backend es de confianza, pero el navegador nunca debe
// recibir algo que no sea una dirección web (`javascript:` y similares).
function esDireccionWeb(texto: string): boolean {
  try {
    const url = new URL(texto);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const MENSAJE_SIN_ENLACE = "No pudimos abrir el pago. Inténtalo de nuevo en un momento.";

// «Pagar ahora»: pide a la pasarela el enlace de un pago pendiente.
export async function pedirEnlaceDePagoAccion(pagoId: unknown): Promise<ResultadoDeEnlace> {
  if (typeof pagoId !== "string" || !FORMATO_DE_UUID.test(pagoId)) return { ok: false, mensaje: "No encontramos ese pago." };
  const resultado = await obtenerEnlaceDePago(pagoId);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeServicio(resultado.error) };
  if (!esDireccionWeb(resultado.datos.url)) return { ok: false, mensaje: MENSAJE_SIN_ENLACE };
  return { ok: true, url: resultado.datos.url };
}

export type ResultadoDeCompra = { ok: true; url: string | null } | { ok: false; mensaje: string };

// Comprar un paquete de la bolsa. `clave` la genera la pantalla: el mismo paquete reintentado usa la misma.
export async function comprarBolsaAccion(codigo: unknown, clave: unknown): Promise<ResultadoDeCompra> {
  if (typeof codigo !== "string" || !FORMATO_DE_CODIGO.test(codigo)) return { ok: false, mensaje: "Elige un paquete." };
  if (typeof clave !== "string" || clave.length < 8 || clave.length > 100) {
    return { ok: false, mensaje: "No pudimos enviar la compra. Recarga la página e inténtalo de nuevo." };
  }
  const resultado = await comprarPaquete(codigo, clave);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeServicio(resultado.error) };
  revalidatePath("/app/bolsa");
  const url = resultado.datos.url;
  // Sin dirección (la pasarela no devolvió una) no se finge: se avisa.
  if (url === null || !esDireccionWeb(url)) return { ok: false, mensaje: MENSAJE_SIN_ENLACE };
  return { ok: true, url };
}
