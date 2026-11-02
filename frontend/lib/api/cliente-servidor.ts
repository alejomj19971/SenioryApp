import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { secretoBff, urlDelBackend } from "@/lib/configuracion";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { COOKIE_DE_ACCESO, COOKIE_DE_REFRESCO, RUTA_DE_INGRESO } from "@/lib/sesion/constantes";

export { COOKIE_DE_ACCESO, RUTA_DE_INGRESO };

// Cliente HTTP del BFF hacia el backend (F0 §4.6). Solo corre en el servidor: en el navegador no hay
// URL del backend, ni secreto, ni tokens.

// Si el backend no responde en este tiempo, la persona ve un error claro en vez de una pantalla colgada.
// Se ajusta con mediciones reales (F0, decisión 2).
export const TIEMPO_MAXIMO_MS = 8_000;

export interface OpcionesDePeticion {
  metodo?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  consulta?: Record<string, string>;
  cuerpo?: unknown;
  // Un archivo como cuerpo (los documentos del cuidador): ni JSON ni multipart. El nombre viaja codificado en una
  // cabecera; el backend decide el tipo por el CONTENIDO, no por lo que se declare aquí.
  archivo?: { contenido: Uint8Array<ArrayBuffer>; tipo: string; nombre?: string };
  // Para lo que tarda más que una consulta (subir un archivo).
  tiempoMaximoMs?: number;
  // Para los POST que crean dinero o alertas: un reintento no los duplica.
  claveDeIdempotencia?: string;
  // No envía la cookie de sesión (por ejemplo, al iniciar sesión). Por defecto se envía si existe.
  sinSesion?: boolean;
  // Para la petición que sigue a un inicio de sesión: la cookie recién guardada todavía no está en la petición
  // entrante, así que se pasa el token a mano.
  tokenDeAcceso?: string;
  // Solo `/auth/refresh` y `/auth/logout`: el refresco se envía a mano (su cookie no viaja a otras rutas del backend).
  tokenDeRefresco?: string;
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
  if (opciones.archivo !== undefined) {
    saliente.set("Content-Type", opciones.archivo.tipo);
    if (opciones.archivo.nombre !== undefined) saliente.set("X-Nombre-De-Archivo", encodeURIComponent(opciones.archivo.nombre));
  }
  if (opciones.claveDeIdempotencia !== undefined) {
    saliente.set("Idempotency-Key", opciones.claveDeIdempotencia);
  }
  const galletas: string[] = [];
  if (opciones.sinSesion !== true) {
    const acceso = opciones.tokenDeAcceso ?? (await cookies()).get(COOKIE_DE_ACCESO)?.value;
    if (acceso !== undefined && acceso !== "") galletas.push(`${COOKIE_DE_ACCESO}=${acceso}`);
  }
  if (opciones.tokenDeRefresco !== undefined && opciones.tokenDeRefresco !== "") {
    galletas.push(`${COOKIE_DE_REFRESCO}=${opciones.tokenDeRefresco}`);
  }
  if (galletas.length > 0) saliente.set("Cookie", galletas.join("; "));
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
      body: opciones.archivo !== undefined ? new Blob([opciones.archivo.contenido], { type: opciones.archivo.tipo }) : opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      // Es el comportamiento por defecto en Next 16, pero los datos de una persona nunca se guardan en caché.
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS),
    });
  } catch (causa) {
    throw ErrorDeApi.deRed(causa);
  }
}

// Para componentes de servidor. 401 → a ingresar; 404 → página no encontrada; cualquier otro error se
// lanza como `ErrorDeApi` y lo atrapa `error.tsx`.
export async function leerDelBackend<T>(
  ruta: string,
  opciones: Pick<OpcionesDePeticion, "consulta" | "tokenDeAcceso"> = {},
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

// Abre un flujo de eventos en vivo (SSE) del backend. A diferencia de `pedirAlBackend`, el tiempo máximo cubre solo la
// CONEXIÓN (hasta recibir los encabezados): después el flujo dura lo que el backend decida (hasta 10 minutos) y solo lo
// corta quien lo pidió (`senal`: el navegador se fue) o el backend.
export async function abrirFlujoDelBackend(
  ruta: string,
  { ultimoEvento, senal }: { ultimoEvento?: string; senal: AbortSignal },
): Promise<Response> {
  const url = direccion(ruta);
  const cabeceras = await encabezados({});
  cabeceras.set("Accept", "text/event-stream");
  if (ultimoEvento !== undefined) cabeceras.set("Last-Event-ID", ultimoEvento);

  const control = new AbortController();
  const cortar = () => control.abort();
  if (senal.aborted) cortar();
  else senal.addEventListener("abort", cortar, { once: true });
  const temporizador = setTimeout(cortar, TIEMPO_MAXIMO_MS);
  try {
    return await fetch(url, { method: "GET", headers: cabeceras, cache: "no-store", redirect: "manual", signal: control.signal });
  } catch (causa) {
    senal.removeEventListener("abort", cortar);
    throw ErrorDeApi.deRed(causa);
  } finally {
    clearTimeout(temporizador);
  }
}
