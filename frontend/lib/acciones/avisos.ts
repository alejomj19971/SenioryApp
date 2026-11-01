"use server";

import { cookies } from "next/headers";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { COOKIE_DE_AVISOS_VISTOS, esCursorValido, esFechaIso } from "@/lib/avisos";
import { listarAvisos, type PaginaDeAvisos } from "@/lib/services/notificaciones";
import { mensajeDeErrorDeServicio } from "@/lib/acciones/errores-de-servicio";

// Acciones de la campana (F5). Son endpoints públicos de Next: validan su entrada.

const UN_ANO_EN_SEGUNDOS = 60 * 60 * 24 * 365;

export type ResultadoDeAvisos = { ok: true; pagina: PaginaDeAvisos } | { ok: false; mensaje: string };

// «Ver más»: los avisos anteriores.
export async function cargarAvisosAccion(cursor: unknown): Promise<ResultadoDeAvisos> {
  if (!esCursorValido(cursor)) return { ok: false, mensaje: "No pudimos cargar los avisos. Recarga la página." };
  try {
    return { ok: true, pagina: await listarAvisos(cursor) };
  } catch (error) {
    if (error instanceof ErrorDeApi) return { ok: false, mensaje: mensajeDeErrorDeServicio(error) };
    throw error;
  }
}

// La persona vio los avisos hasta este (el más reciente de la pantalla): el punto de la campana se apaga. Solo guarda
// una fecha en una cookie de ese dispositivo; nunca retrocede (una pantalla vieja no «des-ve» avisos).
export async function marcarAvisosVistosAccion(hasta: unknown): Promise<void> {
  if (!esFechaIso(hasta)) return;
  const almacen = await cookies();
  const actual = almacen.get(COOKIE_DE_AVISOS_VISTOS)?.value;
  if (actual !== undefined && esFechaIso(actual) && actual >= hasta) return;
  almacen.set(COOKIE_DE_AVISOS_VISTOS, hasta, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UN_ANO_EN_SEGUNDOS,
  });
}
