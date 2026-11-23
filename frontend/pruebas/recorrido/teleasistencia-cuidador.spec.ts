import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  abrirSesion,
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

// El cuidador también ve y usa la teleasistencia de la persona (medicamentos, signos, alerta), pero SOLO mientras
// tiene un servicio activo con ella — nunca antes de aceptar, y sin poder administrar medicamentos (eso es solo de
// la familia). Contra el BACKEND LOCAL REAL, con dos sesiones a la vez. Necesita el administrador y la pasarela de
// prueba (para llegar a "en curso" sin depender de la hora real): sin ellos, se omite.

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
  test.skip(!hayAdministradorDePrueba, "Falta ADMIN_DE_PRUEBA_CORREO / ADMIN_DE_PRUEBA_CONTRASENA en .env.local.");
  test.skip(!hayPasarelaDePrueba, "Falta SECRETO_DE_PASARELA_DE_PRUEBA en .env.local.");
});

const BASE = `http://localhost:${process.env.PUERTO_DE_RECORRIDOS ?? 3100}`;

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

// «Hoy» y la primera hora pedible son el valor por defecto del formulario (el cuidador de prueba declara estar
// libre las 24 horas, todos los días): así el servicio queda dentro de su franja en cuanto se acepte y se pague,
// sin depender de a qué hora real corre la prueba ni de esperar a que empiece.
async function pedirServicioParaHoy(page: Page, cuidadorId: string): Promise<string> {
  await page.goto(`/app/contratar/${cuidadorId}`);
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page).toHaveURL(/\/app\/servicios\/[0-9a-f-]{36}\?nuevo=1$/);
  return page.url().match(/servicios\/([0-9a-f-]{36})/)?.[1] as string;
}

async function pagoDeLaFamilia(cuenta: CuentaDePrueba, servicioId: string) {
  const cookie = await abrirSesion(cuenta);
  return esperarQue(async () => {
    const { pagos } = (await (await pedir("/pagos", { cookie, ip: cuenta.ip })).json()) as { pagos: { id: string; montoTotal: number; servicioId: string | null }[] };
    return pagos.find((pago) => pago.servicioId === servicioId);
  }, "el cobro del servicio existiera");
}

test("el cuidador ve y usa la teleasistencia de la persona mientras el servicio está activo, nunca antes de aceptar", async ({ page, context, browser }) => {
  const cuidador = await crearCuidadorVerificado({ tarifaHora: 20_000 });
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const familia = await crearCuenta({ nombre: "Andrea" });
  await entrar(page, familia, /\/app$/);
  const servicioId = await pedirServicioParaHoy(page, cuidador.cuidadorId);

  const { contexto, pagina } = await otraPersona(browser, cuidador.cuentaDeAcceso, /\/cuidador$/);
  try {
    // Antes de aceptar, no hay botón: todavía no tiene ningún servicio con esa persona.
    await expect(pagina.getByRole("link", { name: /Ver teleasistencia/ })).toHaveCount(0);

    await pagina.getByRole("button", { name: "Aceptar" }).click();
    await expect(pagina.getByRole("heading", { name: /Próximos/ })).toBeVisible();
    // Ya aceptado: el botón aparece.
    await expect(pagina.getByRole("link", { name: /Ver teleasistencia/ })).toBeVisible();

    // La familia paga (simulado) y el cuidador marca que inició.
    const pago = await pagoDeLaFamilia(familia, servicioId);
    expect((await enviarAvisoDePago("pago.aprobado", pago)).status).toBe(200);
    // El pago llega por un evento async: puede tardar un instante en reflejarse como "ya se puede iniciar". Una
    // vez "en curso", la tarjeta queda resumida (colapsada) junto con las demás que ya no piden nada del cuidador.
    await expect(async () => {
      await pagina.reload();
      await pagina.getByRole("button", { name: "Ya llegué: iniciar servicio" }).click();
      await expect(pagina.getByRole("button", { name: /En curso/ })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await pagina.getByRole("button", { name: /En curso/ }).click();
    await expect(pagina.getByRole("button", { name: "Terminé: finalizar servicio" })).toBeVisible();

    await pagina.getByRole("link", { name: /Ver teleasistencia/ }).click();
    await expect(pagina).toHaveURL(new RegExp(`/cuidador/teleasistencia/[0-9a-f-]{36}\\?nombre=.+&edad=\\d+$`));
    await expect(pagina.getByRole("heading", { name: /años/ })).toBeVisible();
    await expect(pagina.getByText("Todavía no hay medicamentos para hoy.")).toBeVisible();
    // Nunca puede administrar medicamentos: eso es solo de la familia.
    await expect(pagina.getByRole("link", { name: "Agregar un medicamento" })).toHaveCount(0);
    await expect(pagina.getByRole("link", { name: "Administrar medicamentos" })).toHaveCount(0);

    // Registra signos vitales, igual que la familia
    await pagina.getByRole("button", { name: "Registrar signos" }).click();
    await pagina.getByLabel("Presión alta").fill("120");
    await pagina.getByLabel("Presión baja").fill("80");
    await pagina.getByRole("button", { name: "Guardar lectura" }).click();
    await expect(pagina.getByRole("dialog")).toHaveCount(0);
    await expect(pagina.getByText("120/80", { exact: true })).toBeVisible();

    // La familia ve la misma lectura en su propia pantalla: es la misma persona, los mismos datos.
    await page.goto("/app/teleasistencia");
    await expect(page.getByText("120/80", { exact: true })).toBeVisible();

    // Pide ayuda: avisa igual que lo haría la familia (sin "línea de emergencia" inventada).
    await pagina.getByRole("button", { name: "Pedir ayuda ahora" }).click();
    await expect(pagina.getByText("Alerta enviada")).toBeVisible({ timeout: 15_000 });
    await expect(pagina.getByText(/línea de emergencia/i)).toHaveCount(0);

    // Al finalizar el servicio, el botón ya no aparece en el panel.
    await pagina.keyboard.press("Escape");
    await pagina.goto("/cuidador");
    await pagina.getByRole("button", { name: /En curso/ }).click();
    await pagina.getByRole("button", { name: "Terminé: finalizar servicio" }).click();
    await expect(pagina.getByRole("link", { name: /Ver teleasistencia/ })).toHaveCount(0);
  } finally {
    await contexto.close();
  }
});
