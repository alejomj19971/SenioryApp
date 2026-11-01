import { cookiesDeSesionDe, type CookieDeSesion } from "@/lib/sesion/cookies";
import { COOKIE_DE_REFRESCO } from "@/lib/sesion/constantes";

// Pide al backend un par nuevo de tokens con el de refresco. Sin `server-only`: lo usa `proxy.ts`, que corre
// antes de cualquier componente de servidor. No decide permisos; solo mantiene viva la sesión.

export type ResultadoDeRenovacion =
  // El backend dio cookies nuevas (acceso y refresco).
  | { tipo: "renovada"; cookies: CookieDeSesion[] }
  // El refresco ya no sirve (vencido, revocado o robado): hay que volver a ingresar.
  | { tipo: "rechazada" }
  // No hubo respuesta útil (red caída, 5xx): la sesión puede seguir vigente, no se toca.
  | { tipo: "sin_respuesta" };

interface Parametros {
  urlDelBackend: string;
  secretoBff: string;
  refresco: string;
  ip?: string;
  idDeCorrelacion?: string;
}

const TIEMPO_MAXIMO_MS = 5_000;

export async function renovarSesion(parametros: Parametros): Promise<ResultadoDeRenovacion> {
  const encabezados = new Headers({
    Accept: "application/json",
    "X-Seniory-BFF": parametros.secretoBff,
    // La cookie de refresco del backend solo viaja a sus rutas de sesión, así que aquí se envía a mano.
    Cookie: `${COOKIE_DE_REFRESCO}=${parametros.refresco}`,
  });
  if (parametros.ip !== undefined) encabezados.set("X-Cliente-IP", parametros.ip);
  if (parametros.idDeCorrelacion !== undefined) encabezados.set("X-Request-Id", parametros.idDeCorrelacion);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${parametros.urlDelBackend.replace(/\/+$/, "")}/auth/refresh`, {
      method: "POST",
      headers: encabezados,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
  } catch {
    return { tipo: "sin_respuesta" };
  }
  if (respuesta.status === 401) return { tipo: "rechazada" };
  if (respuesta.status !== 204 && !respuesta.ok) return { tipo: "sin_respuesta" };
  const cookies = cookiesDeSesionDe(respuesta).filter((cookie) => cookie.valor !== "");
  return cookies.length === 0 ? { tipo: "sin_respuesta" } : { tipo: "renovada", cookies };
}
