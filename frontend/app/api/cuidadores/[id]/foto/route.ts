import { abrirFotoDeCuidador } from "@/lib/services/cuidadores";

// La foto de perfil de un cuidador (F2/M11, INTEGRACION §7): el servidor de Next la pide al backend y la entrega
// él mismo, así el navegador nunca ve la dirección del backend ni una externa de una importación. Exige sesión (el
// proxy la renueva si hace falta), igual que el resto del directorio.

function texto(estado: number, mensaje: string): Response {
  return new Response(mensaje, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(peticion: Request, contexto: RouteContext<"/api/cuidadores/[id]/foto">) {
  const { id } = await contexto.params;
  const resultado = await abrirFotoDeCuidador(id);

  switch (resultado.tipo) {
    case "imagen":
      return new Response(resultado.cuerpo, {
        status: 200,
        headers: {
          "Content-Type": resultado.tipoDeContenido,
          "X-Content-Type-Options": "nosniff",
          // Pública entre quienes ya tienen sesión: se puede guardar en el navegador.
          "Cache-Control": "private, max-age=86400",
        },
      });
    case "sin_sesion": {
      const origen = new URL(peticion.url);
      const volver = encodeURIComponent(`${origen.pathname}${origen.search}`);
      return Response.redirect(new URL(`/ingresar?volver=${volver}`, origen), 307);
    }
    case "sin_foto":
      return texto(404, "Este cuidador no tiene foto de perfil.");
    case "no_disponible":
      return texto(503, "La foto no está disponible por ahora.");
    case "fallo":
      return texto(502, "No pudimos abrir la foto. Inténtalo de nuevo.");
  }
}
