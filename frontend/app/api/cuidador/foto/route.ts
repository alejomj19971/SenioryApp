import { TAMANO_MAXIMO_DE_FOTO, abrirFotoPropia, subirFoto } from "@/lib/services/postulacion";
import { MENSAJE_DEMASIADAS_SOLICITUDES } from "@/lib/acciones/errores-de-servicio";

// La foto de perfil del propio cuidador: se SUBE (igual que los documentos: el navegador manda el archivo como
// cuerpo de la petición, sin multipart ni base64; el servidor de Next comprueba lo evidente y lo reenvía al backend,
// que decide por el CONTENIDO) y se VE (el servidor de Next la pide al backend y la entrega él mismo, así el
// navegador nunca ve la dirección del backend). A diferencia de los documentos, se muestra de inmediato, sin pasar
// por revisión.

const FORMATOS = ["image/jpeg", "image/png"];

function respuesta(estado: number, cuerpo: object): Response {
  return Response.json(cuerpo, { status: estado, headers: { "Cache-Control": "no-store" } });
}

function texto(estado: number, mensaje: string): Response {
  return new Response(mensaje, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(peticion: Request) {
  const resultado = await abrirFotoPropia();
  switch (resultado.tipo) {
    case "archivo":
      return new Response(resultado.cuerpo, {
        status: 200,
        headers: { "Content-Type": resultado.tipoDeContenido, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
      });
    case "sin_sesion": {
      const origen = new URL(peticion.url);
      const volver = encodeURIComponent(`${origen.pathname}${origen.search}`);
      return Response.redirect(new URL(`/ingresar?volver=${volver}`, origen), 307);
    }
    case "sin_archivo":
      return texto(404, "Todavía no tienes una foto de perfil.");
    case "no_disponible":
      return texto(503, "La foto no está disponible por ahora.");
    case "fallo":
      return texto(502, "No pudimos abrir la foto. Inténtalo de nuevo.");
  }
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

export async function POST(peticion: Request) {
  // Una subida solo puede venir de nuestra propia página (las rutas de Next no traen la defensa de las acciones).
  const origen = peticion.headers.get("origin");
  if (origen !== null && new URL(origen).host !== new URL(peticion.url).host) return respuesta(403, { ok: false, mensaje: "Petición no permitida." });

  const declarado = (peticion.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!FORMATOS.includes(declarado)) return respuesta(415, { ok: false, mensaje: "La foto debe ser JPEG o PNG." });
  const anunciado = Number(peticion.headers.get("content-length") ?? "0");
  if (anunciado > TAMANO_MAXIMO_DE_FOTO) return respuesta(413, { ok: false, mensaje: "La foto pesa más de 3 MB." });

  const contenido = await leerConTope(peticion, TAMANO_MAXIMO_DE_FOTO);
  if (contenido === null) return respuesta(413, { ok: false, mensaje: "La foto pesa más de 3 MB." });
  if (contenido.byteLength === 0) return respuesta(400, { ok: false, mensaje: "La foto está vacía." });

  const resultado = await subirFoto(contenido, declarado);
  if (resultado.ok) return respuesta(200, { ok: true, perfil: resultado.datos });
  const error = resultado.error;
  const mensaje = error.estado === 429 ? MENSAJE_DEMASIADAS_SOLICITUDES : error.estado === 503 ? "Subir la foto no está disponible por ahora. Inténtalo de nuevo más tarde." : error.message;
  return respuesta(error.estado >= 400 && error.estado < 600 ? error.estado : 502, { ok: false, mensaje });
}
