import { NextResponse, type NextRequest } from "next/server";

// Proxy base (F0 §4.7): da a cada petición un identificador de correlación. F1 agrega aquí la
// verificación optimista de la sesión y su renovación; el proxy nunca decide permisos.
//
// El identificador va en los encabezados de la petición HACIA el servidor (no en la respuesta), como
// indica la guía de Next: el cliente HTTP lo lee con `headers()` y lo reenvía al backend, y así una
// misma petición se sigue por los logs de los dos lados.
export function proxy(peticion: NextRequest) {
  const encabezados = new Headers(peticion.headers);
  encabezados.set("x-request-id", crypto.randomUUID());
  return NextResponse.next({ request: { headers: encabezados } });
}

export const config = {
  // Sin archivos estáticos ni imágenes optimizadas: no necesitan correlación y el proxy los frenaría.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|pdf|webp|ico)$).*)"],
};
