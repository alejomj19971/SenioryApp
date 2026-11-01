import { expect, test, type Browser, type Page } from "@playwright/test";
import { ahoraEnColombia, sumarDias } from "../../lib/fecha-colombia";
import { backendDisponible, crearCuenta, crearCuidadorVerificado, ipAleatoria, type CuentaDePrueba } from "../soporte/backend-local";

// Recorrido de mensajería (F8 §6) contra el BACKEND LOCAL REAL: la familia le escribe a su cuidador y este le contesta,
// en dos navegadores a la vez, con los mensajes llegando en vivo (eventos del servidor). Sin backend, se omite.

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

async function pedirServicio(page: Page, cuidadorId: string): Promise<string> {
  await page.goto(`/app/contratar/${cuidadorId}`);
  await page.getByRole("group", { name: "Elegir fecha" }).getByRole("button", { name: "Elegir fecha" }).click();
  await page.getByLabel("Fecha personalizada").fill(sumarDias(ahoraEnColombia().hoy, 60 + dia++));
  await page.getByRole("group", { name: "Elegir franja horaria" }).getByRole("button", { name: "Tarde" }).click();
  await page.getByRole("button", { name: "Aumentar número de horas" }).click();
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}\?nuevo=1$/);
  return page.url().match(/servicios\/([0-9a-f-]{36})/)?.[1] as string;
}

test("la familia y el cuidador conversan; los mensajes llegan en vivo y sin repetirse", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);

  // Sin servicio no hay a quién escribirle: la lista lo explica y no hay nada que abrir.
  await page.goto("/app/mensajes");
  await expect(page.getByText("Todavía no tienes conversaciones")).toBeVisible();

  // Con un servicio pedido, «Escribir» abre la conversación
  await pedirServicio(page, cuidador.cuidadorId);
  await page.getByRole("button", { name: /^Escribir a / }).click();
  await expect(page).toHaveURL(/\/app\/mensajes\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Todavía no hay mensajes. Escribe el primero.")).toBeVisible();
  // No se inventa presencia
  await expect(page.getByText(/en línea|escribiendo/i)).toHaveCount(0);

  await page.getByLabel(/^Mensaje para /).fill("Hola, mi mamá toma sus pastillas a las 8.");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log").getByText("Hola, mi mamá toma sus pastillas a las 8.")).toHaveCount(1);
  await expect(page.getByText("Enviando…")).toHaveCount(0);

  // El cuidador ve la conversación y contesta
  const { contexto, pagina: delCuidador } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    await delCuidador.getByRole("link", { name: /Mensajes/ }).click();
    await delCuidador.getByRole("link", { name: /Andrea/ }).click();
    await expect(delCuidador).toHaveURL(/\/cuidador\/mensajes\/[0-9a-f-]{36}$/);
    await expect(delCuidador.getByText("Hola, mi mamá toma sus pastillas a las 8.")).toBeVisible();

    await delCuidador.getByLabel(/^Mensaje para /).fill("Perfecto, lo tengo presente.");
    await delCuidador.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(delCuidador.getByRole("log").getByText("Perfecto, lo tengo presente.")).toHaveCount(1);

    // La familia lo ve llegar SIN recargar
    await expect(page.getByRole("log").getByText("Perfecto, lo tengo presente.")).toHaveCount(1);
    await expect(page.getByText(/Reconectando|Sin conexión en vivo/)).toHaveCount(0);

    // …y a la inversa
    await page.getByLabel(/^Mensaje para /).fill("Gracias, hasta el martes.");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(delCuidador.getByRole("log").getByText("Gracias, hasta el martes.")).toHaveCount(1);

    // Recargar no pierde ni repite nada, y se ven en orden
    await page.reload();
    const textos = await page.getByRole("log").locator("div.max-w-\\[85\\%\\]").allTextContents();
    expect(textos).toEqual(["Hola, mi mamá toma sus pastillas a las 8.", "Perfecto, lo tengo presente.", "Gracias, hasta el martes."]);

    // La lista de la familia ya muestra la conversación
    await page.goto("/app/mensajes");
    await expect(page.getByRole("link", { name: /Último mensaje/ })).toBeVisible();
  } finally {
    await contexto.close();
  }
});

test("una conversación ajena no existe: ni la familia ni el cuidador de otro la ven", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado();
  const otroCuidador = await crearCuidadorVerificado();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);
  await pedirServicio(page, cuidador.cuidadorId);
  await page.getByRole("button", { name: /^Escribir a / }).click();
  await expect(page).toHaveURL(/\/app\/mensajes\/[0-9a-f-]{36}$/);
  const direccion = new URL(page.url()).pathname.replace("/app/", "/cuidador/");

  const { contexto, pagina } = await otraPersona(browser, otroCuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    const respuesta = await pagina.goto(direccion);
    expect(respuesta?.status()).toBe(404);
  } finally {
    await contexto.close();
  }
});
