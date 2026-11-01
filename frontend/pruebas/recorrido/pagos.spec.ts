import { expect, test, type Browser, type Page } from "@playwright/test";
import { ahoraEnColombia, sumarDias } from "../../lib/fecha-colombia";
import {
  abrirSesion,
  asegurarPaqueteDePrueba,
  backendDisponible,
  crearCuenta,
  crearCuidadorVerificado,
  enviarAvisoDePago,
  esperarQue,
  hayAdministradorDePrueba,
  hayPasarelaDePrueba,
  ipAleatoria,
  pedir,
  type CuentaDePrueba,
} from "../soporte/backend-local";

// Recorridos de pagos (F7 §6) contra el BACKEND LOCAL REAL y su pasarela SIMULADA. La simulada no tiene página de
// pago: un pago pasa a aprobado SOLO con el aviso firmado que ella manda al backend (aquí lo fabrica la prueba).
// Sin backend, administrador de prueba o secreto de la pasarela, se omiten.

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
  test.skip(!hayAdministradorDePrueba, "Falta ADMIN_DE_PRUEBA_CORREO / ADMIN_DE_PRUEBA_CONTRASENA en .env.local.");
  test.skip(!hayPasarelaDePrueba, "Falta SECRETO_DE_PASARELA_DE_PRUEBA en .env.local.");
});

const BASE = `http://localhost:${process.env.PUERTO_DE_RECORRIDOS ?? 3100}`;
let dia = Math.floor(Math.random() * 100);

async function entrar(page: Page, cuenta: CuentaDePrueba, destino: RegExp) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(destino);
}

async function otraPersona(browser: Browser, cuenta: CuentaDePrueba, destino: RegExp) {
  const contexto = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, locale: "es-CO", extraHTTPHeaders: { "x-forwarded-for": cuenta.ip } });
  const pagina = await contexto.newPage();
  await entrar(pagina, cuenta, destino);
  return { contexto, pagina };
}

// La familia pide 2 horas con el medio dado; devuelve el id del servicio.
async function pedir2Horas(page: Page, cuidadorId: string, medio: "pasarela" | "bolsa"): Promise<string> {
  await page.goto(`/app/contratar/${cuidadorId}`);
  await page.getByRole("group", { name: "Elegir fecha" }).getByRole("button", { name: "Elegir fecha" }).click();
  await page.getByLabel("Fecha personalizada").fill(sumarDias(ahoraEnColombia().hoy, 60 + dia++));
  await page.getByRole("group", { name: "Elegir franja horaria" }).getByRole("button", { name: "Tarde" }).click();
  await page.getByRole("button", { name: "Aumentar número de horas" }).click();
  await expect(page.getByText(/43\.200/).first()).toBeVisible();
  if (medio === "bolsa") await page.getByRole("switch", { name: /Pagar con mi bolsa/ }).click();
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}\?nuevo=1$/);
  return page.url().match(/servicios\/([0-9a-f-]{36})/)?.[1] as string;
}

async function aceptar(browser: Browser, cuidador: Awaited<ReturnType<typeof crearCuidadorVerificado>>) {
  const { contexto, pagina } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    await pagina.getByRole("button", { name: "Aceptar" }).click();
    await expect(pagina.getByRole("heading", { name: /Próximos/ })).toBeVisible();
  } finally {
    await contexto.close();
  }
}

// El pago de la familia, tal como lo ve el backend (para firmar el aviso con su id y su monto).
async function pagoDeLaFamilia(cuenta: CuentaDePrueba, servicioId: string) {
  const cookie = await abrirSesion(cuenta);
  return esperarQue(async () => {
    const { pagos } = (await (await pedir("/pagos", { cookie, ip: cuenta.ip })).json()) as { pagos: { id: string; montoTotal: number; servicioId: string | null }[] };
    return pagos.find((pago) => pago.servicioId === servicioId);
  }, "el cobro del servicio existiera");
}

test("pagar un servicio: la familia paga en la pasarela y el pago solo cambia con el aviso firmado", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado({ tarifaHora: 20_000 });
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);
  const servicioId = await pedir2Horas(page, cuidador.cuidadorId, "pasarela");
  await aceptar(browser, cuidador);

  // El cobro nace unos instantes después de aceptar: la pantalla lo dice y permite actualizar.
  await page.goto(`/app/servicios/${servicioId}`);
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/Falta pagar/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText(/Falta pagar.*43\.200/)).toBeVisible();

  // «Pagar ahora» pide el enlace al servidor y manda a la pasarela (simulada: se intercepta la salida)
  let destino = "";
  await page.route(/\/pagos\/simulada\//, async (ruta) => {
    destino = ruta.request().url();
    await ruta.fulfill({ status: 200, contentType: "text/html", body: "<p>Pasarela simulada</p>" });
  });
  await page.getByRole("button", { name: "Pagar ahora" }).click();
  await expect.poll(() => destino).toMatch(/\/pagos\/simulada\/[0-9a-f-]{36}$/);
  // La salida a la pasarela sigue en curso: se espera a que termine antes de navegar a otra parte.
  await page.waitForURL(/\/pagos\/simulada\//);
  // Volver sin que la pasarela avise NO cambia nada: el navegador no decide que está pagado.
  await page.goto(`/app/servicios/${servicioId}`);
  await expect(page.getByText(/Falta pagar/)).toBeVisible();

  // La pasarela avisa (con firma): ahora sí
  const pago = await pagoDeLaFamilia(familia, servicioId);
  expect((await enviarAvisoDePago("pago.aprobado", pago, { firmaValida: false })).status).toBe(401);
  expect((await enviarAvisoDePago("pago.aprobado", pago)).status).toBe(200);
  await page.reload();
  await expect(page.getByText("Pago recibido.")).toBeVisible();
  await expect(page.getByText(/Pagaste/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Pagar ahora" })).toHaveCount(0);

  // Cancelar un servicio ya pagado devuelve el dinero
  await page.getByRole("button", { name: "Cancelar el servicio" }).click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("Cancelado")).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Te devolvimos el dinero.")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
});

test("un pago rechazado cancela el servicio y dice que no se cobró nada", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);
  const servicioId = await pedir2Horas(page, cuidador.cuidadorId, "pasarela");
  await aceptar(browser, cuidador);
  const pago = await pagoDeLaFamilia(familia, servicioId);

  expect((await enviarAvisoDePago("pago.rechazado", pago)).status).toBe(200);

  await expect(async () => {
    await page.goto(`/app/servicios/${servicioId}`);
    await expect(page.getByRole("alert").filter({ hasText: "El pago no se completó" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("Cancelado")).toBeVisible();
  await expect(page.getByText(/No se te cobró nada/).first()).toBeVisible();
});

test("la bolsa de horas: comprar, acreditar con el aviso firmado, y pagar un servicio con ella", async ({ page, context, browser }) => {
  const codigo = await asegurarPaqueteDePrueba();
  test.skip(codigo === null, "No se pudo crear un paquete de prueba (se necesita Docker y el contenedor seniory_postgres).");
  const cuidador = await crearCuidadorVerificado({ tarifaHora: 20_000 });
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);

  // En cero, y con el catálogo real (con precios que vienen del servidor)
  await page.goto("/app/bolsa");
  await expect(page.getByRole("heading", { name: "Mi bolsa de horas" })).toBeVisible();
  await expect(page.getByLabel("Saldo")).toContainText("$ 0");
  await expect(page.getByText("Todavía no tienes movimientos.")).toBeVisible();
  const tarjeta = page.getByRole("article", { name: "Paquete de 10 horas" });
  await expect(tarjeta).toContainText("194.400");
  await expect(tarjeta).toContainText("216.000");

  // Comprar: queda pendiente en la pasarela (se intercepta la salida) y la bolsa NO se acredita todavía
  let salio = false;
  await page.route(/\/pagos\/simulada\//, async (ruta) => {
    salio = true;
    await ruta.fulfill({ status: 200, contentType: "text/html", body: "<p>Pasarela simulada</p>" });
  });
  await tarjeta.getByRole("button", { name: "Comprar este paquete" }).click();
  await expect.poll(() => salio).toBe(true);
  // La salida a la pasarela sigue en curso: se espera a que termine antes de navegar a otra parte.
  await page.waitForURL(/\/pagos\/simulada\//);
  await page.goto("/app/bolsa");
  await expect(page.getByLabel("Saldo")).toContainText("$ 0");

  // La pasarela avisa: se acredita el CRÉDITO del paquete
  const cookie = await abrirSesion(familia);
  const compra = await esperarQue(async () => {
    const { pagos } = (await (await pedir("/pagos", { cookie, ip: familia.ip })).json()) as { pagos: { id: string; montoTotal: number; paqueteCodigo: string | null }[] };
    return pagos.find((pago) => pago.paqueteCodigo === codigo);
  }, "la compra existiera");
  expect((await enviarAvisoDePago("pago.aprobado", compra)).status).toBe(200);
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel("Saldo")).toContainText("216.000", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("Compra de la bolsa")).toBeVisible();

  // Pedir un servicio con la bolsa: el cobro nace aprobado al aceptar y el saldo se aparta
  const servicioId = await pedir2Horas(page, cuidador.cuidadorId, "bolsa");
  await expect(page.getByText("Se paga con tu bolsa de horas")).toBeVisible();
  await aceptar(browser, cuidador);
  await expect(async () => {
    await page.goto(`/app/servicios/${servicioId}`);
    await expect(page.getByText(/Se descontó de tu bolsa/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.goto("/app/bolsa");
  await expect(page.getByLabel("Saldo")).toContainText("172.800");
  await expect(page.getByLabel("Saldo")).toContainText("43.200 apartados");
});

test("el cuidador ve sus pagos y la landing muestra las bolsas reales, no las de ejemplo", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  const { contexto, pagina } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    await pagina.getByRole("link", { name: /Tus pagos/ }).click();
    await expect(pagina).toHaveURL(/\/cuidador\/liquidaciones$/);
    await expect(pagina.getByLabel("Por recibir")).toContainText("$ 0");
    await expect(pagina.getByText(/Todavía no tienes pagos/)).toBeVisible();
    // Un cuidador no entra a las pantallas de pagos de las familias
    await pagina.goto("/app/bolsa");
    await expect(pagina).toHaveURL(/\/cuidador$/);
  } finally {
    await contexto.close();
  }

  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  await page.goto("/");
  const html = await page.content();
  expect(html).not.toMatch(/ilustrativos para la demo|Precios de referencia/);
  await expect(page.getByRole("heading", { name: "Bolsas de horas con descuento" })).toBeVisible();
  await expect(page.getByText("La teleasistencia siempre es gratis")).toBeVisible();
});
