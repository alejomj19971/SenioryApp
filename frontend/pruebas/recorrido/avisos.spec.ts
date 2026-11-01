import { expect, test, type Browser, type Page } from "@playwright/test";
import { ahoraEnColombia, sumarDias } from "../../lib/fecha-colombia";
import { backendDisponible, crearCuenta, crearCuidadorVerificado, ipAleatoria, type CuentaDePrueba } from "../soporte/backend-local";

// Recorrido de avisos (F5 §6) contra el BACKEND LOCAL REAL: lo que pasa con un servicio le llega a cada parte por la
// campana, con su propio texto. Sin backend, se omite.

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
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

async function pedirServicio(page: Page, cuidadorId: string) {
  await page.goto(`/app/contratar/${cuidadorId}`);
  await page.getByRole("group", { name: "Elegir fecha" }).getByRole("button", { name: "Elegir fecha" }).click();
  await page.getByLabel("Fecha personalizada").fill(sumarDias(ahoraEnColombia().hoy, 70 + dia++));
  await page.getByRole("group", { name: "Elegir franja horaria" }).getByRole("button", { name: "Tarde" }).click();
  await page.getByRole("button", { name: "Aumentar número de horas" }).click();
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}\?nuevo=1$/);
}

// Los avisos llegan unos segundos después (los entrega una tarea del backend): se recarga hasta verlos.
async function esperarAviso(page: Page, ruta: string, titulo: string) {
  await expect(async () => {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { name: "Avisos" })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(titulo, { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test("un servicio avisa a cada parte con su texto; el punto de la campana se apaga al verlos", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);

  // Sin servicios, la campana está vacía y lo dice
  await page.goto("/app/avisos");
  await expect(page.getByText("No tienes avisos")).toBeVisible();

  await pedirServicio(page, cuidador.cuidadorId);
  await esperarAviso(page, "/app/avisos", "Solicitud enviada");
  await expect(page.getByText("Nuevo", { exact: true })).toBeVisible();
  // El aviso lleva a los servicios
  await page.getByRole("link", { name: /Solicitud enviada/ }).click();
  await expect(page).toHaveURL(/\/app\/servicios$/);
  // Ya los vio: la campana no tiene punto
  await expect(page.getByRole("link", { name: "Avisos", exact: true })).toBeVisible();

  const { contexto, pagina: delCuidador } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    // El cuidador tiene su propio aviso (con otro texto) y el punto en la campana
    await esperarAviso(delCuidador, "/cuidador/avisos", "Nueva solicitud de servicio");
    await expect(delCuidador.getByText("Solicitud enviada", { exact: true })).toHaveCount(0);
    await delCuidador.goto("/cuidador");
    await expect(delCuidador.getByRole("link", { name: "Avisos", exact: true })).toBeVisible();

    // Acepta: la familia recibe «Servicio confirmado»
    await delCuidador.getByRole("button", { name: "Aceptar" }).click();
    await expect(delCuidador.getByRole("heading", { name: /Próximos/ })).toBeVisible();
    await esperarAviso(page, "/app/avisos", "Servicio confirmado");
    await expect(page.getByText("Solicitud enviada", { exact: true })).toBeVisible();
  } finally {
    await contexto.close();
  }
});

test("el punto de la campana aparece con un aviso sin ver y se apaga al abrir los avisos", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);
  await pedirServicio(page, cuidador.cuidadorId);

  await expect(async () => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "Avisos: tienes avisos nuevos" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await page.getByRole("link", { name: "Avisos: tienes avisos nuevos" }).click();
  await expect(page.getByRole("heading", { name: "Avisos" })).toBeVisible();
  await expect(page.getByText("Nuevo", { exact: true }).first()).toBeVisible();

  // Se marcó como visto en este dispositivo: al volver, ya no hay punto
  await expect(async () => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "Avisos", exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  // Otro dispositivo (otro navegador) de la misma persona sí lo ve como nuevo: es una comodidad de cada dispositivo
  const { contexto, pagina } = await otraPersona(browser, familia, /\/app$/);
  try {
    await expect(pagina.getByRole("link", { name: "Avisos: tienes avisos nuevos" })).toBeVisible();
  } finally {
    await contexto.close();
  }
});
