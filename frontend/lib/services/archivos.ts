import "server-only";
import { pedirAlBackend } from "@/lib/api/cliente-servidor";
import { urlDelBackend } from "@/lib/configuracion";

// Archivos privados del backend (hoja de vida, documentos de verificación). El backend responde con una redirección a
// una dirección FIRMADA y de vida corta; aquí, en el SERVIDOR, se sigue y se entrega el archivo: el navegador nunca ve
// esa dirección ni la del backend (INTEGRACION §7).

export type ResultadoDeArchivo =
  | { tipo: "archivo"; cuerpo: ReadableStream<Uint8Array>; tipoDeContenido: string }
  | { tipo: "sin_archivo" }
  | { tipo: "no_disponible" }
  | { tipo: "sin_sesion" }
  | { tipo: "fallo" };

const TIEMPO_MAXIMO_DEL_ARCHIVO_MS = 15_000;

// La dirección firmada viene de NUESTRO backend, no de la persona; aun así solo se sigue si es https (un bucket
// real) o del propio backend (el almacén local de desarrollo): nada de pedir a direcciones cualquiera.
function direccionPermitida(destino: URL): boolean {
  return destino.protocol === "https:" || destino.origin === new URL(urlDelBackend()).origin;
}

// `tiposPermitidos`: solo se entrega un archivo cuyo tipo (el que declara el almacén) empiece por alguno de ellos.
export async function descargarArchivoDelBackend(ruta: string, tiposPermitidos: readonly string[]): Promise<ResultadoDeArchivo> {
  const respuesta = await pedirAlBackend(ruta);
  if (respuesta.status === 401) return { tipo: "sin_sesion" };
  if (respuesta.status === 404) return { tipo: "sin_archivo" };
  if (respuesta.status === 503) return { tipo: "no_disponible" };
  const ubicacion = respuesta.headers.get("location");
  if (respuesta.status < 300 || respuesta.status >= 400 || ubicacion === null) return { tipo: "fallo" };

  let destino: URL;
  try {
    destino = new URL(ubicacion, urlDelBackend());
  } catch {
    return { tipo: "fallo" };
  }
  if (!direccionPermitida(destino)) return { tipo: "fallo" };

  let archivo: Response;
  try {
    archivo = await fetch(destino, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(TIEMPO_MAXIMO_DEL_ARCHIVO_MS) });
  } catch {
    return { tipo: "fallo" };
  }
  if (!archivo.ok || archivo.body === null) return { tipo: "sin_archivo" };
  const tipoDeContenido = (archivo.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!tiposPermitidos.some((permitido) => tipoDeContenido.startsWith(permitido))) return { tipo: "fallo" };
  return { tipo: "archivo", cuerpo: archivo.body, tipoDeContenido };
}
