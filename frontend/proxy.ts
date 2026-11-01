import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_DE_ACCESO,
  COOKIE_DE_REFRESCO,
  MARGEN_DE_RENOVACION_SEGUNDOS,
  RUTA_DE_INGRESO,
  RUTA_DE_INICIO,
} from "@/lib/sesion/constantes";
import { opcionesDeCookie } from "@/lib/sesion/cookies";
import { segundosParaVencer } from "@/lib/sesion/jwt";
import { renovarSesion } from "@/lib/sesion/renovar";

// Proxy (F0 §4.7 y F1 §4.2). Hace tres cosas, todas OPTIMISTAS: el proxy nunca decide permisos (la verificación
// real la hacen `verificarSesion()` y el backend en cada petición).
//
//  1. Da a cada petición un identificador de correlación, en los encabezados de la petición HACIA el servidor
//     (no en la respuesta): el cliente HTTP lo reenvía al backend y una misma petición se sigue por los logs.
//  2. Redirige rápido: sin sesión a `/ingresar?volver=…`; con sesión, las pantallas de invitado a `/app`.
//  3. Renueva el token de acceso antes de que venza. Las cookies nuevas van en la RESPUESTA (para el navegador)
//     y en la PETICIÓN que continúa (para que los componentes de servidor de esta misma navegación ya usen el
//     token nuevo: no pueden escribir cookies).

const RUTAS_PROTEGIDAS = ["/app", "/bienvenida", "/cuidador", "/admin"];
const RUTAS_DE_INVITADO = ["/ingresar", "/registro"];

const esRutaDe = (ruta: string, bases: string[]) =>
  bases.some((base) => ruta === base || ruta.startsWith(`${base}/`));

const FORMATO_DE_IP = /^[0-9a-fA-F:.]{3,45}$/;

function ipDelNavegador(peticion: NextRequest): string | undefined {
  const primera = peticion.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return primera !== undefined && FORMATO_DE_IP.test(primera) ? primera : undefined;
}

function irA(peticion: NextRequest, destino: string): NextResponse {
  return NextResponse.redirect(new URL(destino, peticion.url));
}

function borrarCookies(respuesta: NextResponse): NextResponse {
  respuesta.cookies.delete({ name: COOKIE_DE_ACCESO, path: "/" });
  respuesta.cookies.delete({ name: COOKIE_DE_REFRESCO, path: "/" });
  return respuesta;
}

export async function proxy(peticion: NextRequest): Promise<NextResponse> {
  const ruta = peticion.nextUrl.pathname;
  const idDeCorrelacion = crypto.randomUUID();
  const acceso = peticion.cookies.get(COOKIE_DE_ACCESO)?.value;
  const refresco = peticion.cookies.get(COOKIE_DE_REFRESCO)?.value;
  const hayRefresco = refresco !== undefined && refresco !== "";
  const haySesion = hayRefresco || (acceso !== undefined && acceso !== "");

  if (esRutaDe(ruta, RUTAS_DE_INVITADO) && haySesion) return irA(peticion, RUTA_DE_INICIO);

  let cookiesNuevas: { nombre: string; valor: string; expira?: Date }[] = [];

  if (esRutaDe(ruta, RUTAS_PROTEGIDAS)) {
    if (!haySesion) {
      const volver = `${ruta}${peticion.nextUrl.search}`;
      return irA(peticion, `${RUTA_DE_INGRESO}?volver=${encodeURIComponent(volver)}`);
    }
    const porVencer = segundosParaVencer(acceso) < MARGEN_DE_RENOVACION_SEGUNDOS;
    const urlDelBackend = process.env.SENIORY_API_URL?.trim();
    const secretoBff = process.env.SENIORY_BFF_SECRETO?.trim();
    // Sin configuración no se intenta: la primera lectura al backend dirá exactamente qué variable falta.
    if (porVencer && hayRefresco && urlDelBackend && secretoBff) {
      const resultado = await renovarSesion({
        urlDelBackend,
        secretoBff,
        refresco,
        ip: ipDelNavegador(peticion),
        idDeCorrelacion,
      });
      if (resultado.tipo === "rechazada") {
        return borrarCookies(irA(peticion, RUTA_DE_INGRESO));
      }
      if (resultado.tipo === "renovada") cookiesNuevas = resultado.cookies;
    }
  }

  // Las cookies nuevas también van a la petición que continúa.
  const encabezados = new Headers(peticion.headers);
  encabezados.set("x-request-id", idDeCorrelacion);
  if (cookiesNuevas.length > 0) {
    const vigentes = new Map(peticion.cookies.getAll().map((cookie) => [cookie.name, cookie.value]));
    for (const cookie of cookiesNuevas) vigentes.set(cookie.nombre, cookie.valor);
    encabezados.set(
      "cookie",
      [...vigentes.entries()].map(([nombre, valor]) => `${nombre}=${valor}`).join("; "),
    );
  }

  const respuesta = NextResponse.next({ request: { headers: encabezados } });
  for (const cookie of cookiesNuevas) {
    respuesta.cookies.set(cookie.nombre, cookie.valor, opcionesDeCookie(cookie.expira));
  }
  return respuesta;
}

export const config = {
  // Sin archivos estáticos ni imágenes optimizadas: no necesitan correlación y el proxy los frenaría.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|pdf|webp|ico)$).*)"],
};
