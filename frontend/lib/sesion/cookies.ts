import { COOKIE_DE_ACCESO, COOKIE_DE_REFRESCO } from "@/lib/sesion/constantes";

// Sin `server-only`: también lo usa `proxy.ts`.

export interface CookieDeSesion {
  nombre: string;
  valor: string;
  expira?: Date;
}

// Una línea `Set-Cookie`: «nombre=valor; Expires=…; Max-Age=…; Path=…; HttpOnly». Se leen solo el nombre, el valor
// y el vencimiento (los demás atributos los decide `opcionesDeCookie`).
function leerSetCookie(linea: string): CookieDeSesion | null {
  const [par, ...atributos] = linea.split(";").map((parte) => parte.trim());
  const igual = par?.indexOf("=") ?? -1;
  if (par === undefined || igual <= 0) return null;
  const cookie: CookieDeSesion = { nombre: par.slice(0, igual), valor: par.slice(igual + 1) };
  let vencimiento: Date | undefined;
  for (const atributo of atributos) {
    const [nombre = "", ...resto] = atributo.split("=");
    const valor = resto.join("=");
    if (nombre.toLowerCase() === "max-age" && /^-?\d+$/.test(valor)) {
      vencimiento = new Date(Date.now() + Number(valor) * 1000);
      break; // `Max-Age` manda sobre `Expires`.
    }
    if (nombre.toLowerCase() === "expires") {
      const fecha = new Date(valor);
      if (!Number.isNaN(fecha.getTime())) vencimiento = fecha;
    }
  }
  return vencimiento === undefined ? cookie : { ...cookie, expira: vencimiento };
}

// Las cookies de sesión que trae una respuesta del backend. Solo las dos nuestras: cualquier otra se ignora. Una
// cookie borrada por el backend (cierre de sesión) llega con valor vacío.
export function cookiesDeSesionDe(respuesta: Response): CookieDeSesion[] {
  return respuesta.headers
    .getSetCookie()
    .map(leerSetCookie)
    .filter(
      (cookie): cookie is CookieDeSesion =>
        cookie !== null && (cookie.nombre === COOKIE_DE_ACCESO || cookie.nombre === COOKIE_DE_REFRESCO),
    );
}

// Cómo se guardan en el dominio de Next. El backend emite el refresco con `Path=/api/v1/auth` (para que solo viaje
// a sus rutas de sesión); en nuestro dominio esa ruta no existe, así que AMBAS van con `Path=/`. Son
// `HttpOnly` (JavaScript no las ve), `SameSite=Lax` y `Secure` en producción.
export function opcionesDeCookie(expira?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expira !== undefined && !Number.isNaN(expira.getTime()) ? { expires: expira } : {}),
  };
}
