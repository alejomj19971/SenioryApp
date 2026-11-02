import { abrirDocumentoDeRevision } from "@/lib/services/verificaciones";
import { verificarSesion } from "@/lib/sesion";

// Un documento privado de un cuidador, para el revisor (F9, INTEGRACION §7). El servidor de Next lo pide al backend (que
// lo entrega solo a administradores y deja constancia de cada apertura en la auditoría) y lo entrega él mismo: la
// dirección firmada de 2 minutos nunca llega al navegador.

function texto(estado: number, mensaje: string): Response {
  return new Response(mensaje, { status: estado, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(_peticion: Request, contexto: RouteContext<"/api/admin/documentos/[id]">) {
  const { id } = await contexto.params;
  // Antes de pedir nada: solo un administrador (el backend lo vuelve a exigir).
  const perfil = await verificarSesion();
  if (perfil.usuario.rol !== "administrador") return texto(403, "No tienes permiso para abrir este documento.");

  const resultado = await abrirDocumentoDeRevision(id);
  switch (resultado.tipo) {
    case "archivo":
      return new Response(resultado.cuerpo, {
        status: 200,
        headers: {
          "Content-Type": resultado.tipoDeContenido,
          "Content-Disposition": 'inline; filename="documento"',
          "X-Content-Type-Options": "nosniff",
          // Documento de identidad o antecedentes de una persona: ni caché compartida ni guardado en el navegador.
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    case "sin_sesion":
      return texto(401, "Ingresa de nuevo para ver el documento.");
    case "sin_archivo":
      return texto(404, "No encontramos ese documento.");
    case "no_disponible":
      return texto(503, "Los documentos no están disponibles por ahora.");
    case "fallo":
      return texto(502, "No pudimos abrir el documento. Inténtalo de nuevo.");
  }
}
