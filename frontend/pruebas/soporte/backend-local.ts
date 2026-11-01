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

// ── Un cuidador VERIFICADO, por el flujo real de M9 ───────────────────────────────────────────────────────────────
// Se registra como cuidador, arma su perfil, sube sus cuatro documentos y pide la revisión; un administrador aprueba
// los tres controles y el backend lo activa y lo muestra (E7). Así las pruebas de contratación tienen a alguien a
// quien contratar y con quien iniciar sesión (los cuidadores de las semillas no tienen contraseña conocida).
// Hace falta una cuenta de administrador local: `ADMIN_DE_PRUEBA_CORREO` y `ADMIN_DE_PRUEBA_CONTRASENA` en
// `.env.local` (se crea con `npm run crear-admin` en backend/). Sin ella, las pruebas que lo usan se omiten.

const CORREO_DEL_ADMIN = process.env.ADMIN_DE_PRUEBA_CORREO ?? "";
const CONTRASENA_DEL_ADMIN = process.env.ADMIN_DE_PRUEBA_CONTRASENA ?? "";

export const hayAdministradorDePrueba = CORREO_DEL_ADMIN !== "" && CONTRASENA_DEL_ADMIN !== "";

const PDF_MINIMO = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

export interface CuidadorDePrueba {
  cuentaDeAcceso: CuentaDePrueba;
  cuidadorId: string;
  nombre: string;
  tarifaHora: number;
}

async function subirDocumento(tipo: string, cookie: string, ip: string): Promise<void> {
  const respuesta = await fetch(`${URL_DEL_BACKEND}/cuidadores/yo/documentos/${tipo}`, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", "X-Nombre-De-Archivo": `${tipo}.pdf`, "X-Seniory-BFF": SECRETO_BFF, "X-Cliente-IP": ip, Cookie: cookie },
    body: PDF_MINIMO,
  });
  if (!respuesta.ok) throw new Error(`No se pudo subir el documento ${tipo} (${respuesta.status}): ${await respuesta.text()}`);
}

export async function crearCuidadorVerificado({
  tarifaHora = 20_000,
  zona = "Laureles",
  conHojaDeVida = false,
}: { tarifaHora?: number; zona?: string; conHojaDeVida?: boolean } = {}): Promise<CuidadorDePrueba> {
  if (!hayAdministradorDePrueba) throw new Error("Falta ADMIN_DE_PRUEBA_CORREO / ADMIN_DE_PRUEBA_CONTRASENA en .env.local.");
  const cuenta: CuentaDePrueba = {
    nombre: "Cuidadora de Prueba",
    correo: correoUnico("cuidadora"),
    contrasena: CONTRASENA_DE_PRUEBA,
    nombreDeLaPersona: "",
    ip: ipAleatoria(),
  };
  const registro = await pedir("/auth/registro-cuidador", {
    metodo: "POST",
    ip: cuenta.ip,
    cuerpo: { nombre: cuenta.nombre, correo: cuenta.correo, contrasena: cuenta.contrasena, versionPolitica: "v1" },
  });
  if (!registro.ok) throw new Error(`No se pudo registrar al cuidador (${registro.status}): ${await registro.text()}`);
  const cookie = await abrirSesion(cuenta);

  const perfil = await pedir("/cuidadores/yo", {
    metodo: "POST",
    cookie,
    ip: cuenta.ip,
    cuerpo: {
      especialidad: "enfermeria",
      titulo: "Enfermera profesional de prueba",
      aniosExperiencia: 5,
      tarifaHora,
      telefono: `+57300${String(randomInt(1_000_000, 9_999_999))}`,
      zona,
      disponibilidad: ["manana", "tarde", "noche"],
      bio: "Cuidadora creada por las pruebas automáticas.",
    },
  });
  if (!perfil.ok) throw new Error(`No se pudo crear el perfil (${perfil.status}): ${await perfil.text()}`);
  const { perfil: datos } = (await perfil.json()) as { perfil: { id: string } };

  for (const tipo of ["cedula", "antecedentes", "titulo", "psicotecnica", ...(conHojaDeVida ? ["hoja_de_vida"] : [])]) {
    await subirDocumento(tipo, cookie, cuenta.ip);
  }
  const revision = await pedir("/cuidadores/yo/revision", { metodo: "POST", cookie, ip: cuenta.ip });
  if (!revision.ok) throw new Error(`No se pudo pedir la revisión (${revision.status}): ${await revision.text()}`);

  // Un administrador aprueba los tres controles (la vigencia máxima es de 5 años).
  const dentroDeTresAnios = new Date(Date.now() + 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  const admin = await abrirSesion({ nombre: "", correo: CORREO_DEL_ADMIN, contrasena: CONTRASENA_DEL_ADMIN, nombreDeLaPersona: "", ip: ipAleatoria() });
  const cola = await pedir("/verificaciones?estado=pendiente", { cookie: admin });
  const { verificaciones } = (await cola.json()) as { verificaciones: { id: string; control: string; cuidador: { id: string } }[] };
  const mias = verificaciones.filter((v) => v.cuidador.id === datos.id);
  if (mias.length !== 3) throw new Error(`Se esperaban 3 controles pendientes del cuidador y hay ${mias.length}.`);
  for (const v of mias) {
    const decision = await pedir(`/verificaciones/${v.id}`, {
      metodo: "PATCH",
      cookie: admin,
      cuerpo: { decision: "aprobar", vigenteHasta: v.control === "titulos" ? null : dentroDeTresAnios },
    });
    if (!decision.ok) throw new Error(`No se pudo aprobar ${v.control} (${decision.status}): ${await decision.text()}`);
  }
  // La hoja de vida pública se aprueba aparte (es lo que verán las familias).
  if (conHojaDeVida) {
    const hojas = await pedir("/verificaciones/hojas-de-vida", { cookie: admin });
    const { hojasDeVida } = (await hojas.json()) as { hojasDeVida: { documento: { id: string }; cuidador: { id: string } }[] };
    const mia = hojasDeVida.find((hoja) => hoja.cuidador.id === datos.id);
    if (mia === undefined) throw new Error("La hoja de vida no apareció en la cola de revisión.");
    const aprobada = await pedir(`/verificaciones/documentos/${mia.documento.id}`, { metodo: "PATCH", cookie: admin, cuerpo: { decision: "aprobar" } });
    if (!aprobada.ok) throw new Error(`No se pudo aprobar la hoja de vida (${aprobada.status}): ${await aprobada.text()}`);
  }
  return { cuentaDeAcceso: cuenta, cuidadorId: datos.id, nombre: cuenta.nombre, tarifaHora };
}

// ── Pagos: avisos firmados de la pasarela SIMULADA y un paquete de bolsa de prueba ───────────────────────────────────
// La pasarela simulada no tiene una página de pago: un pago pasa a aprobado SOLO con el aviso firmado que ella misma
// manda al backend. Las pruebas lo fabrican igual que lo haría una real (HMAC-SHA256 del cuerpo exacto con el
// secreto compartido, `SECRETO_DE_PASARELA_DE_PRUEBA` en `.env.local`). Sin secreto, esas pruebas se omiten.

const SECRETO_DE_LA_PASARELA = process.env.SECRETO_DE_PASARELA_DE_PRUEBA ?? "";
export const hayPasarelaDePrueba = SECRETO_DE_LA_PASARELA !== "";

export async function enviarAvisoDePago(
  tipo: "pago.aprobado" | "pago.rechazado",
  pago: { id: string; montoTotal: number },
  { firmaValida = true, idEvento = randomBytes(8).toString("hex") }: { firmaValida?: boolean; idEvento?: string } = {},
): Promise<Response> {
  const { createHmac } = await import("node:crypto");
  const cuerpo = JSON.stringify({ idEvento, tipo, referencia: pago.id, monto: pago.montoTotal });
  const firma = createHmac("sha256", firmaValida ? SECRETO_DE_LA_PASARELA : "otro-secreto").update(cuerpo).digest("hex");
  return fetch(`${URL_DEL_BACKEND}/pagos/webhook/simulada`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Seniory-Firma": firma, "X-Seniory-BFF": SECRETO_BFF, "X-Cliente-IP": ipAleatoria() },
    body: cuerpo,
  });
}

// Espera (hasta 15 s) a que se cumpla algo que el backend hace por eventos (el cobro nace unos instantes después de
// que el cuidador acepta).
export async function esperarQue<T>(leer: () => Promise<T | null | undefined | false>, descripcion: string): Promise<T> {
  const limite = Date.now() + 15_000;
  for (;;) {
    const valor = await leer();
    if (valor !== null && valor !== undefined && valor !== false) return valor;
    if (Date.now() > limite) throw new Error(`Se esperaba que ${descripcion}, y no ocurrió en 15 s.`);
    await new Promise((resolver) => setTimeout(resolver, 400));
  }
}

// El catálogo de bolsas viene VACÍO hasta que el negocio apruebe precios (no se inventan): para probar la compra se
// crean dos paquetes («prueba-10h» y «prueba-5h») en la base LOCAL con el contenedor de Postgres de desarrollo. Devuelve su código, o null si no hay
// Docker o el contenedor (entonces las pruebas de compra se omiten).
export async function asegurarPaqueteDePrueba(): Promise<string | null> {
  const { execFileSync } = await import("node:child_process");
  const contenedor = process.env.CONTENEDOR_DE_BD ?? "seniory_postgres";
  const sql =
    "insert into pagos.paquetes_de_bolsa (codigo, horas_referencia, descuento_bps, credito, precio, activo) " +
    "values ('prueba-10h', 10, 1000, 216000, 194400, true), ('prueba-5h', 5, 500, 108000, 102600, true) " +
    "on conflict (codigo) do update set activo = true, credito = excluded.credito, precio = excluded.precio, descuento_bps = excluded.descuento_bps, horas_referencia = excluded.horas_referencia";
  try {
    execFileSync("docker", ["exec", contenedor, "psql", "-U", "seniory", "-d", "seniory", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "ignore" });
    return "prueba-10h";
  } catch {
    return null;
  }
}
