import "server-only";
import { cookies } from "next/headers";
import { leerDelBackend } from "@/lib/api/cliente-servidor";
import type { AvisoDelBackend, PaginaDeAvisosDelBackend } from "@/lib/api/contratos/notificaciones";
import { avisosNuevos, COOKIE_DE_AVISOS_VISTOS, esCursorValido } from "@/lib/avisos";
import type { Aviso } from "@/lib/types";

// Avisos (M5) sobre la API: la campana de la aplicación. Cada persona ve solo los suyos: el backend toma el
// destinatario de la sesión.

function aAviso(a: AvisoDelBackend): Aviso {
  return { id: a.id, tipo: a.tipo, titulo: a.titulo, cuerpo: a.cuerpo, prioridad: a.prioridad, creadaEn: a.creadaEn };
}

export interface PaginaDeAvisos {
  avisos: Aviso[];
  // Para pedir los siguientes; null si no hay más.
  siguiente: string | null;
}

export async function listarAvisos(cursor?: string, limite = 20): Promise<PaginaDeAvisos> {
  const consulta: Record<string, string> = { limite: String(limite) };
  if (cursor !== undefined && esCursorValido(cursor)) consulta.cursor = cursor;
  const pagina = await leerDelBackend<PaginaDeAvisosDelBackend>("/notificaciones", { consulta });
  return { avisos: pagina.notificaciones.map(aAviso), siguiente: pagina.siguiente };
}

// ¿Hay avisos que esta persona no ha visto en este dispositivo? Se pregunta en cada pantalla (el punto de la campana),
// así que NUNCA rompe la pantalla: si el backend no responde, simplemente no hay punto.
export async function hayAvisosNuevos(): Promise<boolean> {
  try {
    const vistoHasta = (await cookies()).get(COOKIE_DE_AVISOS_VISTOS)?.value;
    const { avisos } = await listarAvisos(undefined, 20);
    return avisosNuevos(avisos, vistoHasta).length > 0;
  } catch {
    return false;
  }
}
