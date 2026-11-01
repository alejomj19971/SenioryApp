import { abrirFlujoDeEventos } from "@/lib/services/mensajeria";

// Los mensajes nuevos en vivo (F8, INTEGRACION §7). El navegador abre un `EventSource` a esta ruta; el servidor de Next
// abre el flujo del backend con la cookie de la persona y lo reenvía tal cual. Así el navegador nunca habla con el
// backend ni ve su dirección. El backend cierra cada conexión a los 10 minutos (para volver a verificar la sesión) y el
// navegador se reconecta con `Last-Event-ID`: no se pierde nada (puede repetirse un mensaje; se reconoce por su id).

export const dynamic = "force-dynamic";

function texto(estado: number, mensaje: string): Response {
  return new Response(mensaje, { status: estado, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(peticion: Request) {
  const url = new URL(peticion.url);
  // Un `EventSource` que se reconecta solo manda `Last-Event-ID`; si la pantalla lo vuelve a crear a mano, lo manda
  // en `?desde=`.
  const ultimoEvento = peticion.headers.get("last-event-id") ?? url.searchParams.get("desde") ?? undefined;
  const resultado = await abrirFlujoDeEventos(ultimoEvento === "" ? undefined : ultimoEvento, peticion.signal);

  switch (resultado.tipo) {
    case "flujo":
      return new Response(resultado.cuerpo, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          // Sin búfer intermedio (proxies): cada evento sale al instante.
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    case "sin_sesion":
      return texto(401, "Inicia sesión para ver tus mensajes.");
    case "no_valido":
      return texto(400, "La solicitud no es válida.");
    case "demasiadas":
      return texto(429, "Hay demasiadas conexiones abiertas.");
    case "fallo":
      return texto(502, "No pudimos abrir los mensajes en vivo.");
  }
}
