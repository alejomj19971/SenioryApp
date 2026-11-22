import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  backendDisponible,
  crearCuenta,
  crearCuidadorVerificado,
  hayAdministradorDePrueba,
  ipAleatoria,
  type CuentaDePrueba,
} from "../soporte/backend-local";

// Recorridos de servicios (F3+F4 §6) contra el BACKEND LOCAL REAL, con dos personas a la vez (la familia y el
// cuidador, cada una con su sesión). El cuidador se crea por el flujo real de M9. Sin el backend o sin el
// administrador de prueba (`ADMIN_DE_PRUEBA_*` en `.env.local`), se omiten.

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
  test.skip(!hayAdministradorDePrueba, "Falta ADMIN_DE_PRUEBA_CORREO / ADMIN_DE_PRUEBA_CONTRASENA en .env.local.");
});

const BASE = `http://localhost:${process.env.PUERTO_DE_RECORRIDOS ?? 3100}`;

async function entrar(page: Page, cuenta: CuentaDePrueba, destino: RegExp) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(destino);
}

// Otra persona con su propia sesión (otro contexto del navegador, otra «IP»).
async function otraPersona(browser: Browser, cuenta: CuentaDePrueba, destino: RegExp) {
  const contexto = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, locale: "es-CO", extraHTTPHeaders: { "x-forwarded-for": cuenta.ip } });
  const pagina = await contexto.newPage();
  await entrar(pagina, cuenta, destino);
  return { contexto, pagina };
}

async function pedirServicio(page: Page, cuidadorId: string, { horas = 2 }: { horas?: number } = {}) {
  await page.goto(`/app/contratar/${cuidadorId}`);
  await page.getByRole("group", { name: "Elegir fecha" }).getByRole("button", { name: "Mañana" }).click();
  // Fecha "mañana" (el día siguiente): cualquier hora de la tarde está siempre disponible sin importar la
  // hora real en que corra la prueba.
  await page.getByRole("group", { name: "Elegir hora" }).getByRole("button", { name: "12:00 p. m." }).click();
  for (let i = 1; i < horas; i++) await page.getByRole("button", { name: "Aumentar número de horas" }).click();
  await expect(page.getByText(/43\.200/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
}

test("la familia pide, el cuidador acepta con SU vista del dinero, y la familia cancela", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado({ tarifaHora: 20_000 });
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);

  // 1. La familia pide 2 horas: el servidor cotiza 20.000 × 2 + 8 % = 43.200 y el resultado es una SOLICITUD
  await pedirServicio(page, cuidador.cuidadorId);
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}\?nuevo=1$/);
  await expect(page.getByText("¡Solicitud enviada!")).toBeVisible();
  await expect(page.getByText("Esperando al cuidador")).toBeVisible();
  await expect(page.getByText("no se cobra nada hasta que acepte")).toBeVisible();
  const idDelServicio = page.url().match(/servicios\/([0-9a-f-]{36})/)?.[1] as string;

  // Aparece en «Mis servicios»
  await page.getByRole("link", { name: "Servicios", exact: true }).click();
  await expect(page.getByRole("link", { name: /Esperando al cuidador/ })).toBeVisible();

  // 2. El cuidador lo ve con lo que RECIBE (36.000), nunca con lo que paga la familia, y acepta
  const { contexto, pagina: paginaDelCuidador } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    await expect(paginaDelCuidador.getByRole("heading", { name: /Por responder/ })).toBeVisible();
    await expect(paginaDelCuidador.getByText(/Recibes\s+\$\s?36\.000/)).toBeVisible();
    const html = await paginaDelCuidador.content();
    expect(html).not.toMatch(/43\.200|43200|3\.200/);
    await paginaDelCuidador.getByRole("button", { name: "Aceptar" }).click();
    await expect(paginaDelCuidador.getByRole("heading", { name: /Próximos/ })).toBeVisible();
    await expect(paginaDelCuidador.getByText("Aceptado")).toBeVisible();
  } finally {
    await contexto.close();
  }

  // 3. La familia ve el servicio confirmado
  await page.goto(`/app/servicios/${idDelServicio}`);
  await expect(page.getByText("Confirmado")).toBeVisible();
  // La familia no ve lo que cobra el cuidador
  expect(await page.content()).not.toMatch(/36\.000|pagoProfesional/);

  // 4. La familia cancela (con confirmación) y el servicio queda cancelado
  await page.getByRole("button", { name: "Cancelar el servicio" }).click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("Cancelado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar el servicio" })).toHaveCount(0);
});

test("el cuidador puede rechazar una solicitud y la familia lo ve sin cobro", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);
  await pedirServicio(page, cuidador.cuidadorId);
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}/);
  const id = page.url().match(/servicios\/([0-9a-f-]{36})/)?.[1] as string;

  const { contexto, pagina } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    await pagina.getByRole("button", { name: "Rechazar" }).click();
    await expect(pagina.getByRole("heading", { name: /Cancelados/ })).toBeVisible();
  } finally {
    await contexto.close();
  }

  await page.goto(`/app/servicios/${id}`);
  await expect(page.getByText("Cancelado")).toBeVisible();
  await expect(page.getByText("No se te cobró nada").first()).toBeVisible();
});

test("sin doble reserva: otra familia que pide la misma franja recibe un mensaje claro", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const primera = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, primera, /\/app$/);
  await pedirServicio(page, cuidador.cuidadorId);
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}/);

  const segunda = await crearCuenta({ nombre: "Beatriz" });
  const { contexto, pagina } = await otraPersona(browser, segunda, /\/app$/);
  try {
    await pedirServicio(pagina, cuidador.cuidadorId);
    await expect(pagina.getByRole("alert").filter({ hasText: "ya tiene un servicio en ese horario" })).toBeVisible();
    await expect(pagina).toHaveURL(/\/app\/contratar\//);
  } finally {
    await contexto.close();
  }
});

test("contratar a varios cuidadores juntos desde el carrito", async ({ page, context }) => {
  const zonaUnica = `ZonaCarrito${Date.now()}`;
  const maria = await crearCuidadorVerificado({ tarifaHora: 20_000, nombre: "María Carrito", zona: zonaUnica });
  const carlos = await crearCuidadorVerificado({ tarifaHora: 25_000, nombre: "Carlos Carrito", zona: zonaUnica });
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);

  // Se filtra por la zona única de esta prueba para no depender de cuántos cuidadores haya de más en el directorio.
  await page.goto(`/app/cuidadores?zona=${encodeURIComponent(zonaUnica)}`);
  await page.getByRole("button", { name: `Seleccionar a ${maria.nombre} para contratar junto con otros` }).click();
  await page.getByRole("button", { name: `Seleccionar a ${carlos.nombre} para contratar junto con otros` }).click();
  await expect(page.getByText("2 cuidadores seleccionados")).toBeVisible();
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/app\/contratar\/carrito\?ids=/);

  const tarjetaMaria = page.getByRole("region", { name: maria.nombre });
  await tarjetaMaria.getByRole("group", { name: "Elegir fecha" }).getByRole("button", { name: "Mañana" }).click();
  await tarjetaMaria.getByRole("group", { name: "Elegir hora" }).getByRole("button", { name: "12:00 p. m." }).click();

  const tarjetaCarlos = page.getByRole("region", { name: carlos.nombre });
  await tarjetaCarlos.getByRole("group", { name: "Elegir fecha" }).getByRole("button", { name: "Mañana" }).click();
  await tarjetaCarlos.getByRole("group", { name: "Elegir hora" }).getByRole("button", { name: "12:00 p. m." }).click();

  // Total combinado: 20.000×1,08 + 25.000×1,08 = 21.600 + 27.000 = 48.600
  await expect(page.getByText(/48\.600/)).toBeVisible();

  await page.getByRole("button", { name: "Enviar las 2 solicitudes" }).click();
  await expect(tarjetaMaria.getByText("Solicitud enviada")).toBeVisible();
  await expect(tarjetaCarlos.getByText("Solicitud enviada")).toBeVisible();

  await page.getByRole("button", { name: "Ir a mis servicios" }).click();
  await expect(page).toHaveURL(/\/app\/servicios$/);
  await expect(page.getByRole("link", { name: /Esperando al cuidador/ })).toHaveCount(2);
});

test("un servicio ajeno es «no encontrado» y un cuidador no entra al área de las familias", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);
  await pedirServicio(page, cuidador.cuidadorId);
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}/);
  const id = page.url().match(/servicios\/([0-9a-f-]{36})/)?.[1] as string;

  const otra = await crearCuenta({ nombre: "Otra" });
  const { contexto, pagina } = await otraPersona(browser, otra, /\/app$/);
  try {
    expect((await pagina.goto(`/app/servicios/${id}`))?.status()).toBe(404);
    expect((await pagina.goto("/app/servicios/no-es-un-uuid"))?.status()).toBe(404);
  } finally {
    await contexto.close();
  }

  const { contexto: deCuidador, pagina: paginaDeCuidador } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    // Un cuidador que escribe la dirección de la familia es llevado a su panel.
    await paginaDeCuidador.goto("/app");
    await expect(paginaDeCuidador).toHaveURL(/\/cuidador$/);
  } finally {
    await deCuidador.close();
  }
});
