// Diagnóstico TEMPORAL (se borra en el próximo commit): para ver qué host ve Next.js detrás del proxy de
// Render, comparado con el que manda el navegador en el encabezado Origin.
export async function GET(peticion: Request) {
  return Response.json({
    url: peticion.url,
    hostDeUrl: new URL(peticion.url).host,
    origin: peticion.headers.get("origin"),
    host: peticion.headers.get("host"),
    xForwardedHost: peticion.headers.get("x-forwarded-host"),
    xForwardedProto: peticion.headers.get("x-forwarded-proto"),
  });
}

export async function POST(peticion: Request) {
  return GET(peticion);
}
