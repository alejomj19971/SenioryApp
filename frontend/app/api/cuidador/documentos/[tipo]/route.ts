import { TAMANO_MAXIMO_DE_DOCUMENTO, subirDocumento } from "@/lib/services/postulacion";
import { MENSAJE_DEMASIADAS_SOLICITUDES } from "@/lib/acciones/errores-de-servicio";
import type { TipoDeDocumento } from "@/lib/types";

// Subida de documentos del cuidador (F9, INTEGRACION §7). El navegador manda el archivo como cuerpo de esta petición
// (sin multipart ni base64); el servidor de Next comprueba lo evidente (tipo declarado y tamaño, leyendo con tope) y lo
// reenvía al backend, que decide por el CONTENIDO. El navegador nunca habla con el backend.

const TIPOS: TipoDeDocumento[] = ["cedula", "antecedentes", "titulo", "psicotecnica", "hoja_de_vida"];
const FORMATOS = ["application/pdf", "image/jpeg", "image/png"];

function respuesta(estado: number, cuerpo: object): Response {
  return Response.json(cuerpo, { status: estado, headers: { "Cache-Control": "no-store" } });
}

// Lee el cuerpo hasta el tope: más grande se corta sin guardarlo entero en memoria.
async function leerConTope(peticion: Request, tope: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (peticion.body === null) return new Uint8Array(0);
  const lector = peticion.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > tope) {
      await lector.cancel();
      return null;
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(new ArrayBuffer(total));
  let desplazamiento = 0;
  for (const trozo of trozos) {
    todo.set(trozo, desplazamiento);
    desplazamiento += trozo.byteLength;
  }
  return todo;
}

export async function POST(peticion: Request, contexto: RouteContext<"/api/cuidador/documentos/[tipo]">) {
  // Una subida solo puede venir de nuestra propia página (las rutas de Next no traen la defensa de las acciones).
  // Se compara contra el encabezado Host (el navegador nunca deja que una página lo falsifique), no contra
  // peticion.url: detrás de un proxy (Render, etc.) esa URL trae el host INTERNO del proceso, no el dominio
  // público, y la comparación fallaba siempre.
  const origen = peticion.headers.get("origin");
  const hostDePeticion = peticion.headers.get("host");
  if (origen !== null && hostDePeticion !== null && new URL(origen).host !== hostDePeticion) return respuesta(403, { ok: false, mensaje: "Petición no permitida." });

  const { tipo } = await contexto.params;
  if (!TIPOS.includes(tipo as TipoDeDocumento)) return respuesta(404, { ok: false, mensaje: "Ese documento no existe." });
  const declarado = (peticion.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!FORMATOS.includes(declarado)) return respuesta(415, { ok: false, mensaje: "El archivo debe ser PDF, JPEG o PNG." });
  if (tipo === "hoja_de_vida" && declarado !== "application/pdf") return respuesta(415, { ok: false, mensaje: "La hoja de vida debe ser un PDF." });
  const anunciado = Number(peticion.headers.get("content-length") ?? "0");
  if (anunciado > TAMANO_MAXIMO_DE_DOCUMENTO) return respuesta(413, { ok: false, mensaje: "El archivo pesa más de 5 MB." });

  const contenido = await leerConTope(peticion, TAMANO_MAXIMO_DE_DOCUMENTO);
  if (contenido === null) return respuesta(413, { ok: false, mensaje: "El archivo pesa más de 5 MB." });
  if (contenido.byteLength === 0) return respuesta(400, { ok: false, mensaje: "El archivo está vacío." });

  let nombre = "archivo";
  try {
    nombre = decodeURIComponent(peticion.headers.get("x-nombre-de-archivo") ?? "archivo").slice(0, 200);
  } catch {
    // Mal codificado: es solo una etiqueta.
  }

  const resultado = await subirDocumento(tipo as TipoDeDocumento, contenido, declarado, nombre);
  if (resultado.ok) return respuesta(201, { ok: true, documento: resultado.datos });
  const error = resultado.error;
  const mensaje = error.estado === 429 ? MENSAJE_DEMASIADAS_SOLICITUDES : error.estado === 503 ? "Subir documentos no está disponible por ahora. Inténtalo de nuevo más tarde." : error.message;
  return respuesta(error.estado >= 400 && error.estado < 600 ? error.estado : 502, { ok: false, mensaje });
}
