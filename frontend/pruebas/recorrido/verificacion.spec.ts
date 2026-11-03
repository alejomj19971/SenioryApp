import { randomInt } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  abrirSesion,
  backendDisponible,
  CONTRASENA_DE_PRUEBA,
  correoUnico,
  crearCuenta,
  hayAdministradorDePrueba,
  ipAleatoria,
  pedir,
  type CuentaDePrueba,
} from "../soporte/backend-local";

// Recorrido de la postulación y la verificación de un cuidador (F9 §6) contra el BACKEND LOCAL REAL: se registra, arma su
// perfil, sube sus documentos, un administrador los revisa (aprueba, rechaza con motivo) y, ya aprobado, las familias lo
// encuentran. Necesita el administrador de prueba; sin backend o sin él, se omite.

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
  test.skip(!hayAdministradorDePrueba, "Falta ADMIN_DE_PRUEBA_CORREO / ADMIN_DE_PRUEBA_CONTRASENA en .env.local.");
});

const BASE = `http://localhost:${process.env.PUERTO_DE_RECORRIDOS ?? 3100}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const CUENTA_DEL_ADMIN: CuentaDePrueba = {
  nombre: "Revisora",
  correo: process.env.ADMIN_DE_PRUEBA_CORREO ?? "",
  contrasena: process.env.ADMIN_DE_PRUEBA_CONTRASENA ?? "",
  nombreDeLaPersona: "",
  ip: ipAleatoria(),
};

async function entrar(page: Page, cuenta: CuentaDePrueba, destino: RegExp) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(destino);
}

async function otraPersona(browser: Browser, cuenta: CuentaDePrueba, destino: RegExp) {
  const contexto = await browser.newContext({ baseURL: BASE, viewport: { width: 1100, height: 900 }, locale: "es-CO", extraHTTPHeaders: { "x-forwarded-for": cuenta.ip } });
  const pagina = await contexto.newPage();
  await entrar(pagina, cuenta, destino);
  return { contexto, pagina };
}

const subirPdf = (page: Page, tipo: string, nombre = `${tipo}.pdf`) => page.locator(`#archivo-${tipo}`).setInputFiles({ name: nombre, mimeType: "application/pdf", buffer: PDF });

// La tarjeta de una verificación de ESTA cuidadora (la cola agrupa por persona: una tarjeta con su nombre, y dentro
// una por cada control pendiente).
const tarjeta = (admin: Page, nombre: string, control: string) => admin.getByRole("listitem", { name: nombre }).getByRole("listitem", { name: control });

test("un cuidador se postula, un revisor lo aprueba (y rechaza lo que no se lee) y las familias lo encuentran", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const nombre = `Lucía Revisión ${randomInt(10_000, 99_999)}`;
  const cuenta: CuentaDePrueba = { nombre, correo: correoUnico("postulante"), contrasena: CONTRASENA_DE_PRUEBA, nombreDeLaPersona: "", ip: ipAleatoria() };
  await context.setExtraHTTPHeaders({ "x-forwarded-for": cuenta.ip });

  // ── Se registra como cuidador ────────────────────────────────────────────────────────────────────────────────────
  await page.goto("/registro/cuidador");
  await expect(page.getByRole("heading", { name: "Postúlate como cuidador" })).toBeVisible();
  await page.getByLabel("Tu nombre").fill(nombre);
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/cuidador\/perfil$/);
  await expect(page.getByRole("heading", { name: "Arma tu perfil" })).toBeVisible();

  // Sin perfil, el panel lo lleva a armarlo
  await page.goto("/cuidador");
  await expect(page).toHaveURL(/\/cuidador\/perfil$/);

  // ── Arma su perfil (con errores primero) ─────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Guardar mi perfil" }).click();
  await expect(page.getByText("Revisa lo que escribiste")).toBeVisible();
  await expect(page.getByText("Elige tu especialidad.")).toBeVisible();
  await expect(page.getByText("Elige al menos una jornada.")).toBeVisible();

  await page.getByLabel("Tu especialidad").selectOption("enfermeria");
  await page.getByLabel("Título o formación").fill("Enfermera profesional, U. de A.");
  await page.getByLabel("Años de experiencia").fill("6");
  await page.getByLabel("Tarifa por hora ($)").fill("22000");
  await page.getByLabel("Tu celular").fill(`300 ${randomInt(100, 999)} ${randomInt(1000, 9999)}`);
  await page.getByLabel("Zona donde atiendes").fill("Laureles, Medellín");
  await page.getByLabel("Mañana").check();
  await page.getByLabel("Tarde").check();
  await page.getByLabel("Cuéntales a las familias quién eres").fill("Cuido adultos mayores con paciencia y cariño.");
  await page.getByRole("button", { name: "Guardar mi perfil" }).click();

  // Ya con perfil: su estado, sus controles y sus documentos
  await expect(page.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
  await expect(page.getByText("Todavía no te mostramos a las familias")).toBeVisible();
  await expect(page.getByText("Sin enviar")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Enviar mi perfil a revisión" })).toHaveCount(0);

  // ── Sube sus documentos ──────────────────────────────────────────────────────────────────────────────────────────
  // Un archivo que no es PDF ni imagen se descarta sin molestar al servidor
  await page.locator("#archivo-cedula").setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(page.getByText("Debe ser un PDF, una foto JPEG o una imagen PNG.")).toBeVisible();
  // Uno que dice ser PDF y no lo es lo rechaza el servidor (mira el contenido)
  await page.locator("#archivo-cedula").setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("esto no es un pdf") });
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo subir" })).toBeVisible();

  for (const tipo of ["cedula", "antecedentes", "titulo", "psicotecnica"]) {
    await subirPdf(page, tipo, `${tipo} de lucía.pdf`);
    await expect(page.getByText(`Último archivo: ${tipo} de lucía.pdf`)).toBeVisible();
  }
  await expect(page.getByText("En revisión")).toHaveCount(4);

  // ── Envía su perfil a revisión ───────────────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Enviar mi perfil a revisión" }).click();
  await expect(page.getByText("Estamos revisando tus documentos")).toBeVisible();
  await expect(page.getByText("Un revisor lo está mirando.")).toHaveCount(3);
  // Mientras tanto, no la ve ninguna familia
  const familia = await crearCuenta({ nombre: "Andrea" });
  const sesionDeFamilia = await abrirSesion(familia);
  const { perfil } = (await (await pedir("/cuidadores/yo", { cookie: await abrirSesion(cuenta), ip: cuenta.ip })).json()) as { perfil: { id: string } };
  expect((await pedir(`/cuidadores/${perfil.id}`, { cookie: sesionDeFamilia, ip: familia.ip })).status).toBe(404);

  // ── Un revisor mira la cola ──────────────────────────────────────────────────────────────────────────────────────
  const { contexto, pagina: admin } = await otraPersona(browser, CUENTA_DEL_ADMIN, /\/admin$/);
  try {
    await expect(admin.getByRole("heading", { name: "Panel de revisión" })).toBeVisible();
    await expect(tarjeta(admin, nombre, "Antecedentes")).toBeVisible();
    await expect(tarjeta(admin, nombre, "Títulos")).toBeVisible();
    await expect(tarjeta(admin, nombre, "Prueba psicotécnica")).toBeVisible();

    // Los documentos se abren por nuestro servidor (nunca por una dirección del backend)
    const enlace = tarjeta(admin, nombre, "Antecedentes").getByRole("link", { name: /Antecedentes \(/ });
    const direccion = await enlace.getAttribute("href");
    expect(direccion).toMatch(/^\/api\/admin\/documentos\/[0-9a-f-]{36}$/);
    const abierto = await admin.context().request.get(`${BASE}${direccion}`);
    expect(abierto.status()).toBe(200);
    expect(abierto.headers()["content-type"]).toContain("application/pdf");
    expect(abierto.headers()["cache-control"]).toContain("no-store");

    // Aprueba los antecedentes (pide la vigencia) …
    const deAntecedentes = tarjeta(admin, nombre, "Antecedentes");
    await deAntecedentes.getByRole("button", { name: "Aprobar" }).click();
    // El backend no deja aprobar sin vigencia: se espera su respuesta antes de escribir la fecha (la respuesta reinicia el
    // formulario).
    await expect(deAntecedentes.getByRole("alert")).toBeVisible();
    await deAntecedentes.getByLabel("Vigente hasta").fill(new Date(Date.now() + 2 * 365 * 86_400_000).toISOString().slice(0, 10));
    await deAntecedentes.getByRole("button", { name: "Aprobar" }).click();
    await expect(tarjeta(admin, nombre, "Antecedentes")).toHaveCount(0);

    // … el título (puede no vencer) …
    await tarjeta(admin, nombre, "Títulos").getByRole("button", { name: "Aprobar" }).click();
    await expect(tarjeta(admin, nombre, "Títulos")).toHaveCount(0);

    // … y rechaza la psicotécnica: sin motivo no se puede
    const dePsicotecnica = tarjeta(admin, nombre, "Prueba psicotécnica");
    await dePsicotecnica.getByRole("button", { name: "Rechazar" }).click();
    await expect(dePsicotecnica.getByText(/Explica por qué se rechaza/)).toBeVisible();
    await dePsicotecnica.getByLabel("Motivo del rechazo").fill("El resultado no se alcanza a leer.");
    await dePsicotecnica.getByRole("button", { name: "Rechazar" }).click();
    await expect(tarjeta(admin, nombre, "Prueba psicotécnica")).toHaveCount(0);

    // ── El cuidador ve lo decidido, con el motivo ──────────────────────────────────────────────────────────────────
    await page.goto("/cuidador/perfil");
    await expect(page.getByText("Hay algo por corregir")).toBeVisible();
    await expect(page.getByText("El resultado no se alcanza a leer.")).toBeVisible();
    await expect(page.getByText(/Vigente hasta el .* de \d{4}/)).toBeVisible();
    await expect(page.getByText("No vence.")).toBeVisible();
    // Aún no se muestra: faltaba un control
    expect((await pedir(`/cuidadores/${perfil.id}`, { cookie: sesionDeFamilia, ip: familia.ip })).status).toBe(404);
    // En su panel, la tarjeta de la postulación lo dice
    await page.goto("/cuidador");
    await page.getByRole("link", { name: /Hay algo por corregir/ }).click();
    await expect(page).toHaveURL(/\/cuidador\/perfil$/);

    // Renueva: sube el documento nuevo y pide la revisión otra vez
    await subirPdf(page, "psicotecnica", "psicotecnica nueva.pdf");
    await expect(page.getByText("Último archivo: psicotecnica nueva.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Pedir revisión de prueba psicotécnica" }).click();
    await expect(page.getByText("Un revisor lo está mirando.")).toHaveCount(1);

    // El revisor aprueba lo que falta y el cuidador queda visible
    await admin.reload();
    const deLaNueva = tarjeta(admin, nombre, "Prueba psicotécnica");
    await expect(deLaNueva).toBeVisible();
    await deLaNueva.getByLabel("Vigente hasta").fill(new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10));
    await deLaNueva.getByRole("button", { name: "Aprobar" }).click();
    await expect(tarjeta(admin, nombre, "Prueba psicotécnica")).toHaveCount(0);

    // Las ya decididas tienen su pestaña (el backend lista las 50 más antiguas de cada estado: no se busca a esta cuidadora)
    await admin.getByRole("link", { name: "Aprobadas" }).click();
    await expect(admin.getByRole("heading", { name: /Verificaciones — aprobadas/ })).toBeVisible();
    await expect(admin.getByRole("link", { name: "Aprobadas" })).toHaveAttribute("aria-current", "page");
  } finally {
    await contexto.close();
  }

  await page.goto("/cuidador/perfil");
  await expect(page.getByText("Ya apareces en la búsqueda")).toBeVisible();
  // Los tres controles (los documentos también muestran su estado, por eso se acota a la sección de verificaciones)
  await expect(page.getByRole("region", { name: "Tus verificaciones" }).getByText("Aprobado", { exact: true })).toHaveCount(3);

  // ── Las familias lo encuentran ───────────────────────────────────────────────────────────────────────────────────
  expect((await pedir(`/cuidadores/${perfil.id}`, { cookie: sesionDeFamilia, ip: familia.ip })).status).toBe(200);
  const deLaFamilia = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, locale: "es-CO", extraHTTPHeaders: { "x-forwarded-for": familia.ip } });
  try {
    const paginaDeLaFamilia = await deLaFamilia.newPage();
    await entrar(paginaDeLaFamilia, familia, /\/app$/);
    await paginaDeLaFamilia.goto(`/app/cuidadores/${perfil.id}`);
    await expect(paginaDeLaFamilia.getByRole("heading", { name: nombre })).toBeVisible();
  } finally {
    await deLaFamilia.close();
  }
});

test("el panel de revisión es solo de administradores, y cada cuenta llega a su área", async ({ page, context, browser }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);

  // Una familia no entra al panel ni a pedir documentos
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
  const ajeno = await page.request.get(`${BASE}/api/admin/documentos/01a19299-ec3b-7012-b94b-a8cebad258d3`);
  expect(ajeno.status()).toBe(403);
  // …ni a subir documentos de cuidador
  const subida = await page.request.post(`${BASE}/api/cuidador/documentos/cedula`, { headers: { "Content-Type": "application/pdf" }, data: PDF });
  expect(subida.status()).toBe(403);

  // Un administrador sí, y sin sesión se pide ingresar
  const { contexto, pagina } = await otraPersona(browser, CUENTA_DEL_ADMIN, /\/admin$/);
  try {
    await pagina.goto("/admin?estado=otra");
    await expect(pagina.getByRole("heading", { name: /Verificaciones — por revisar/ })).toBeVisible();
    await pagina.goto("/app");
    await expect(pagina).toHaveURL(/\/admin$/);
  } finally {
    await contexto.close();
  }
  const anonimo = await browser.newContext({ baseURL: BASE });
  try {
    const paginaAnonima = await anonimo.newPage();
    await paginaAnonima.goto("/admin");
    await expect(paginaAnonima).toHaveURL(/\/ingresar/);
  } finally {
    await anonimo.close();
  }
});
