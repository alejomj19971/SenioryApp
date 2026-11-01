import { abrirHojaDeVida } from "@/lib/services/cuidadores";

// La hoja de vida pública de un cuidador (F2, INTEGRACION §7): el servidor de Next pide el PDF al backend y lo
// entrega él mismo, así el navegador nunca ve la dirección del backend ni una URL firmada que se pueda copiar.
// Exige sesión (el proxy la renueva si hace falta).

function texto(estado: number, mensaje: string): Response {
  return new Response(mensaje, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(peticion: Request, contexto: RouteContext<"/api/cuidadores/[id]/hoja-de-vida">) {
  const { id } = await contexto.params;
  const resultado = await abrirHojaDeVida(id);

  switch (resultado.tipo) {
    case "pdf":
      return new Response(resultado.cuerpo, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="hoja-de-vida.pdf"',
          "X-Content-Type-Options": "nosniff",
          // Es un documento de una persona: ni caché compartida ni guardado en el navegador.
          "Cache-Control": "private, no-store",
        },
      });
    case "sin_sesion": {
      const origen = new URL(peticion.url);
      const volver = encodeURIComponent(`${origen.pathname}${origen.search}`);
      return Response.redirect(new URL(`/ingresar?volver=${volver}`, origen), 307);
    }
    case "sin_hoja":
      return texto(404, "Este cuidador no tiene hoja de vida disponible.");
    case "no_disponible":
      return texto(503, "La hoja de vida no está disponible por ahora.");
    case "fallo":
      return texto(502, "No pudimos abrir la hoja de vida. Inténtalo de nuevo.");
  }
}
