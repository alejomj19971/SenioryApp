import { randomBytes, randomInt } from "node:crypto";

// Utilidades para las pruebas que corren contra el BACKEND LOCAL REAL (INTEGRACION §6): ¿está arriba?, crear una
// cuenta por su API y dejarla lista (con persona y autorización). Las pruebas se omiten con un mensaje claro si el
// backend no está encendido; nunca fallan por eso.

function cargarEntorno(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sin .env.local se usan las variables que ya haya en el entorno.
  }
}
cargarEntorno();

export const URL_DEL_BACKEND = process.env.SENIORY_API_URL ?? "http://localhost:3001/api/v1";
const SECRETO_BFF = process.env.SENIORY_BFF_SECRETO ?? "";

export const CONTRASENA_DE_PRUEBA = "una-clave-larga-y-segura-2026";

export async function backendDisponible(): Promise<boolean> {
  try {
    const raiz = new URL(URL_DEL_BACKEND).origin;
    const respuesta = await fetch(`${raiz}/salud/listo`, { signal: AbortSignal.timeout(3_000) });
    return respuesta.ok;
  } catch {
    return false;
  }
}

// Cada cuenta de prueba llega desde su propia «IP»: el backend limita el registro a 5 por minuto y por IP, y solo
// cree en `X-Cliente-IP` si va con el secreto del BFF (igual que hace el frontend).
export function ipAleatoria(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

export function correoUnico(prefijo = "prueba"): string {
  return `${prefijo}.${Date.now()}.${randomBytes(3).toString("hex")}@prueba.seniory.invalid`;
}

interface Llamada {
  ruta: string;
  metodo?: "GET" | "POST";
  cuerpo?: unknown;
  cookie?: string;
  ip: string;
}

async function llamar({ ruta, metodo = "POST", cuerpo, cookie, ip }: Llamada): Promise<Response> {
  return fetch(`${URL_DEL_BACKEND}${ruta}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "X-Seniory-BFF": SECRETO_BFF,
      "X-Cliente-IP": ip,
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

export interface CuentaDePrueba {
  nombre: string;
  correo: string;
  contrasena: string;
  nombreDeLaPersona: string;
  ip: string;
}

// Registra una familia por la API del backend. Con `lista: true` además le da su persona y la autorización de
// salud, que es como llega una familia al inicio de la app.
export async function crearCuenta({ lista = true, nombre = "Familia de Prueba" } = {}): Promise<CuentaDePrueba> {
  const cuenta: CuentaDePrueba = {
    nombre,
    correo: correoUnico("familia"),
    contrasena: CONTRASENA_DE_PRUEBA,
    nombreDeLaPersona: "Doña Rosa",
    ip: ipAleatoria(),
  };
  const registro = await llamar({
    ruta: "/auth/registro",
    ip: cuenta.ip,
    cuerpo: { nombre: cuenta.nombre, correo: cuenta.correo, contrasena: cuenta.contrasena, versionPolitica: "v1" },
  });
  if (!registro.ok) throw new Error(`No se pudo crear la cuenta de prueba (${registro.status}): ${await registro.text()}`);
  if (!lista) return cuenta;

  const acceso = registro.headers.getSetCookie().find((c) => c.startsWith("seniory_acceso="))?.split(";")[0];
  if (acceso === undefined) throw new Error("El backend no entregó la cookie de acceso.");
  const persona = await llamar({
    ruta: "/adultos-mayores",
    ip: cuenta.ip,
    cookie: acceso,
    cuerpo: { nombre: cuenta.nombreDeLaPersona, fechaDeNacimiento: "1948-03-14", parentesco: "hijo_hija" },
  });
  if (!persona.ok) throw new Error(`No se pudo crear la persona (${persona.status}): ${await persona.text()}`);
  const { adultoMayor } = (await persona.json()) as { adultoMayor: { id: string } };
  const consentimiento = await llamar({
    ruta: `/adultos-mayores/${adultoMayor.id}/consentimientos`,
    ip: cuenta.ip,
    cookie: acceso,
    cuerpo: { finalidad: "datos_de_salud", calidad: "representante", versionDelTexto: "v1" },
  });
  if (!consentimiento.ok) throw new Error(`No se pudo dar la autorización (${consentimiento.status}).`);
  return cuenta;
}

// Una petición cualquiera al backend, con el secreto del BFF y la «IP» de la cuenta (sin seguir redirecciones: las
// pruebas miran el 302 de la hoja de vida).
export async function pedir(
  ruta: string,
  { cookie, ip = ipAleatoria(), metodo = "GET", cuerpo }: { cookie?: string; ip?: string; metodo?: string; cuerpo?: unknown } = {},
): Promise<Response> {
  return fetch(`${URL_DEL_BACKEND}${ruta}`, {
    method: metodo,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-Seniory-BFF": SECRETO_BFF,
      "X-Cliente-IP": ip,
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

// Inicia sesión por la API y devuelve la cookie de acceso lista para enviar.
export async function abrirSesion(cuenta: CuentaDePrueba): Promise<string> {
  const respuesta = await pedir("/auth/login", {
    metodo: "POST",
    ip: cuenta.ip,
    cuerpo: { correo: cuenta.correo, contrasena: cuenta.contrasena },
  });
  const cookie = respuesta.headers.getSetCookie().find((c) => c.startsWith("seniory_acceso="))?.split(";")[0];
  if (!respuesta.ok || cookie === undefined) throw new Error(`No se pudo iniciar sesión (${respuesta.status}).`);
  return cookie;
}
