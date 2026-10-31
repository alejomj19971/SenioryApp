import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { secretoBff, urlDelBackend } from "@/lib/configuracion";
import { ErrorDeApi } from "@/lib/api/error-de-api";

// Cliente HTTP del BFF hacia el backend (F0 §4.6). Solo corre en el servidor: en el navegador no hay
// URL del backend, ni secreto, ni tokens.

export const COOKIE_DE_ACCESO = "seniory_acceso";
// Si el backend no responde en este tiempo, la persona ve un error claro en vez de una pantalla colgada.
// Se ajusta con mediciones reales (F0, decisión 2).
export const TIEMPO_MAXIMO_MS = 8_000;
export const RUTA_DE_INGRESO = "/ingresar";

export interface OpcionesDePeticion {
  metodo?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  consulta?: Record<string, string>;
  cuerpo?: unknown;
  // Para los POST que crean dinero o alertas: un reintento no los duplica.
  claveDeIdempotencia?: string;
  // No envía la cookie de sesión (por ejemplo, al iniciar sesión). Por defecto se envía si existe.
  sinSesion?: boolean;
}

const FORMATO_DE_IP = /^[0-9a-fA-F:.]{3,45}$/;

// La IP del navegador, tal como la ve el servidor de Next (primera de `x-forwarded-for`). El backend
// solo la usa si va con el secreto del BFF.
function ipDelNavegador(entrante: Headers): string | undefined {
  const primera = entrante.get("x-forwarded-for")?.split(",")[0]?.trim();
  return primera !== undefined && FORMATO_DE_IP.test(primera) ? primera : undefined;
}

async function encabezados(opciones: OpcionesDePeticion): Promise<Headers> {
  const entrante = await headers();
  const saliente = new Headers({
    Accept: "application/json",
    "X-Seniory-BFF": secretoBff(),
  });
  // El identificador lo genera `proxy.ts`: une los logs del frontend y del backend de una misma petición.
  const idDeCorrelacion = entrante.get("x-request-id");
  if (idDeCorrelacion !== null) saliente.set("X-Request-Id", idDeCorrelacion);
  const ip = ipDelNavegador(entrante);
  if (ip !== undefined) saliente.set("X-Cliente-IP", ip);

  if (opciones.cuerpo !== undefined) saliente.set("Content-Type", "application/json");
  if (opciones.claveDeIdempotencia !== undefined) {
    saliente.set("Idempotency-Key", opciones.claveDeIdempotencia);
  }
  if (opciones.sinSesion !== true) {
    const acceso = (await cookies()).get(COOKIE_DE_ACCESO)?.value;
    if (acceso !== undefined && acceso !== "") saliente.set("Cookie", `${COOKIE_DE_ACCESO}=${acceso}`);
  }
  return saliente;
}

function direccion(ruta: string, consulta?: Record<string, string>): string {
  const url = new URL(`${urlDelBackend()}${ruta.startsWith("/") ? ruta : `/${ruta}`}`);
  for (const [nombre, valor] of Object.entries(consulta ?? {})) url.searchParams.set(nombre, valor);
  return url.toString();
}

// Hace la petición y devuelve la respuesta tal cual (la usa `lib/sesion` para copiar los `Set-Cookie`).
// Solo lanza `ErrorDeApi` si no hubo respuesta (sin red o sin contestar a tiempo).
export async function pedirAlBackend(
  ruta: string,
  opciones: OpcionesDePeticion = {},
): Promise<Response> {
  // Fuera del `try`: un error de configuración (falta una variable) debe verse tal cual, no como
  // «revisa tu conexión».
  const url = direccion(ruta, opciones.consulta);
  const cabeceras = await encabezados(opciones);
  try {
    return await fetch(url, {
      method: opciones.metodo ?? "GET",
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      // Es el comportamiento por defecto en Next 16, pero los datos de una persona nunca se guardan en caché.
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
  } catch (causa) {
    throw ErrorDeApi.deRed(causa);
  }
}

// Para componentes de servidor. 401 → a ingresar; 404 → página no encontrada; cualquier otro error se
// lanza como `ErrorDeApi` y lo atrapa `error.tsx`.
export async function leerDelBackend<T>(
  ruta: string,
  opciones: Pick<OpcionesDePeticion, "consulta"> = {},
): Promise<T> {
  const respuesta = await pedirAlBackend(ruta, { ...opciones, metodo: "GET" });
  if (respuesta.status === 401) redirect(RUTA_DE_INGRESO);
  if (respuesta.status === 404) notFound();
  if (!respuesta.ok) throw await ErrorDeApi.desdeRespuesta(respuesta);
  return (await respuesta.json()) as T;
}

export type ResultadoDeEscritura<T> =
  | { ok: true; datos: T }
  | { ok: false; error: ErrorDeApi };

// Para acciones de servidor. 401 → a ingresar; el resto de errores se devuelven como valor para
// mostrarlos en el formulario (un 409 «correo ya registrado» no es una falla del sistema).
export async function escribirEnBackend<T>(
  ruta: string,
  opciones: OpcionesDePeticion & { metodo: "POST" | "PATCH" | "PUT" | "DELETE" },
): Promise<ResultadoDeEscritura<T>> {
  let respuesta: Response;
  try {
    respuesta = await pedirAlBackend(ruta, opciones);
  } catch (error) {
    if (error instanceof ErrorDeApi) return { ok: false, error };
    throw error;
  }
  if (respuesta.status === 401 && opciones.sinSesion !== true) redirect(RUTA_DE_INGRESO);
  if (!respuesta.ok) return { ok: false, error: await ErrorDeApi.desdeRespuesta(respuesta) };
  const sinCuerpo = respuesta.status === 204 || respuesta.headers.get("content-length") === "0";
  return { ok: true, datos: (sinCuerpo ? undefined : await respuesta.json()) as T };
}
