import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { backendDisponible, crearCuenta, ipAleatoria } from "../soporte/backend-local";

// Recorridos de teleasistencia (F6 §6) contra el BACKEND LOCAL REAL: una familia nueva empieza sin datos y los va
// armando (medicamentos, tomas, signos, alerta). Sin el backend encendido se omiten.

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
});

async function entrar(page: Page, context: BrowserContext, ruta: string) {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const cuenta = await crearCuenta({ nombre: "Andrea" });
  await page.goto(ruta);
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(new RegExp(`${ruta.replaceAll("/", "\\/")}$`));
  return cuenta;
}

test("una familia nueva ve estados vacíos honestos, sin «monitoreo» inventado ni «línea de emergencia»", async ({ page, context }) => {
  await entrar(page, context, "/app/teleasistencia");

  await expect(page.getByRole("heading", { name: /Doña Rosa, \d+ años/ })).toBeVisible();
  await expect(page.getByText("Todavía no hay medicamentos para hoy.")).toBeVisible();
  await expect(page.getByText(/Todavía no hay lecturas/)).toBeVisible();
  // El botón de ayuda dice la verdad: avisa a la familia y al cuidador, no es emergencias, y ofrece llamar al 123
  await expect(page.getByRole("button", { name: "Pedir ayuda ahora" })).toBeVisible();
  await expect(page.getByText(/Seniory no es un servicio de emergencias/)).toBeVisible();
  await expect(page.getByRole("link", { name: "123", exact: true })).toHaveAttribute("href", "tel:123");
  const html = await page.content();
  expect(html).not.toMatch(/línea de emergencia|Monitoreo activo/i);
  // Y ningún dato del prototipo (Losartán, Metformina…)
  expect(html).not.toMatch(/Losartán|Metformina|Atorvastatina/);
});

test("agregar un medicamento, marcar y deshacer sus tomas, y dejar de tomarlo", async ({ page, context }) => {
  await entrar(page, context, "/app/teleasistencia");

  await page.getByRole("link", { name: "Agregar un medicamento" }).click();
  await expect(page).toHaveURL(/\/app\/teleasistencia\/medicamentos$/);
  await page.getByRole("button", { name: "Agregar un medicamento" }).click();

  // Validación junto al campo, sin ir al servidor
  await page.getByRole("button", { name: "Guardar medicamento" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByLabel("Medicamento", { exact: true }).fill("Losartán");
  await page.getByLabel("Dosis", { exact: true }).fill("50 mg");
  await page.getByLabel("Indicaciones (opcional)").fill("Con el desayuno");
  await page.getByLabel("Hora 1", { exact: true }).fill("00:01");
  await page.getByRole("button", { name: "Agregar otra hora" }).click();
  await page.getByLabel("Hora 2", { exact: true }).fill("23:58");
  await page.getByRole("button", { name: "Guardar medicamento" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Losartán · 50 mg")).toBeVisible();
  await expect(page.getByText("A las 00:01, 23:58")).toBeVisible();

  // Las dos tomas del día; la de las 00:01 ya pasó, así que es «la hora del medicamento»
  await page.goto("/app/teleasistencia");
  await expect(page.getByText("0 de 2 tomadas hoy")).toBeVisible();
  await expect(page.getByText("¡Hora del medicamento!")).toBeVisible();

  // Marcar la primera: persiste al recargar (viene del backend, no de la memoria de la pantalla)
  await page.getByRole("button", { name: /Marcar Losartán de las 00:01 como tomado/ }).click();
  await expect(page.getByText("1 de 2 tomadas hoy")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 de 2 tomadas hoy")).toBeVisible();
  await expect(page.getByText("¡Hora del medicamento!")).toHaveCount(0);

  // Deshacer
  await page.getByRole("button", { name: /Deshacer: Losartán de las 00:01/ }).click();
  await expect(page.getByText("0 de 2 tomadas hoy")).toBeVisible();

  // Dejar de tomarlo (con confirmación)
  await page.goto("/app/teleasistencia/medicamentos");
  await page.getByRole("button", { name: "Dejar de tomar Losartán" }).click();
  await page.getByRole("button", { name: "Sí, dejar de tomar" }).click();
  await expect(page.getByText("Todavía no hay medicamentos.")).toBeVisible();
  await page.goto("/app/teleasistencia");
  await expect(page.getByText("Todavía no hay medicamentos para hoy.")).toBeVisible();
});

test("registrar signos: la presión va completa, se ve en la gráfica y en el inicio, y una lectura fuera de rango se avisa", async ({ page, context }) => {
  await entrar(page, context, "/app/teleasistencia");

  await page.getByRole("button", { name: "Registrar signos" }).click();
  // Solo la presión alta: no se acepta
  await page.getByLabel("Presión alta").fill("120");
  await page.getByRole("button", { name: "Guardar lectura" }).click();
  await expect(page.getByText("La presión se registra completa")).toBeVisible();
  // El formulario conserva lo escrito (no hace repetir); se espera a que termine de reponerlo antes de borrar.
  await expect(page.getByLabel("Presión alta")).toHaveValue("120");
  // Nada escrito
  await page.getByLabel("Presión alta").fill("");
  await page.getByRole("button", { name: "Guardar lectura" }).click();
  await expect(page.getByText("Escribe al menos una medida.")).toBeVisible();

  await page.getByLabel("Presión alta").fill("123");
  await page.getByLabel("Presión baja").fill("77");
  await page.getByLabel(/Pulso/).fill("71");
  await page.getByLabel(/Glucosa/).fill("95");
  await page.getByRole("button", { name: "Guardar lectura" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("123/77", { exact: true })).toBeVisible();
  await expect(page.getByText("71 lpm")).toBeVisible();
  await expect(page.getByText("95 mg/dL")).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "fuera del rango" })).toHaveCount(0);

  await page.goto("/app");
  await expect(page.getByText("123/77 mmHg")).toBeVisible();

  // Una glucosa muy alta (sola) es válida y queda marcada; las otras medidas siguen mostrando la última que sí se tomó
  await page.goto("/app/teleasistencia");
  await page.getByRole("button", { name: "Registrar signos" }).click();
  await page.getByLabel(/Glucosa/).fill("400");
  await page.getByRole("button", { name: "Guardar lectura" }).click();
  await expect(page.getByRole("note").filter({ hasText: "fuera del rango esperado" })).toBeVisible();
  await expect(page.getByText("400 mg/dL")).toBeVisible();
  await expect(page.getByText("123/77", { exact: true })).toBeVisible();
});

test("pedir ayuda: se puede cancelar sin avisar; al enviar dice A QUIÉN se avisó y ofrece llamar al 123", async ({ page, context }) => {
  await entrar(page, context, "/app/teleasistencia");

  // Cancelar a tiempo: no se envía nada
  await page.getByRole("button", { name: "Pedir ayuda ahora" }).click();
  await expect(page.getByText(/Pidiendo ayuda en \d/)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText(/Pidiendo ayuda en/)).toHaveCount(0);
  await page.goto("/app");
  await expect(page.getByText(/alerta.* sin atender/)).toHaveCount(0);

  // Enviarla de verdad (la cuenta regresiva dura 5 segundos)
  await page.goto("/app/teleasistencia");
  await page.getByRole("button", { name: "Pedir ayuda ahora" }).click();
  await expect(page.getByText("Alerta enviada")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("dialog").getByText(/^(Avisamos a .+\.|Registramos la alerta, pero no había a quién avisar)/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Llamar al 123/ })).toHaveAttribute("href", "tel:123");
  await expect(page.getByText(/línea de emergencia/i)).toHaveCount(0);

  // Queda registrada: el inicio y la teleasistencia la cuentan como sin atender
  await page.keyboard.press("Escape");
  await page.goto("/app");
  await expect(page.getByText("Una alerta sin atender")).toBeVisible();
  await page.goto("/app/teleasistencia");
  await expect(page.getByRole("note").filter({ hasText: "alerta de ayuda sin atender" })).toBeVisible();
});

test("el comando de voz abre la alerta por la URL", async ({ page, context }) => {
  await entrar(page, context, "/app/teleasistencia");

  await page.goto("/app/teleasistencia?alerta=1");
  await expect(page.getByText(/Pidiendo ayuda en \d/)).toBeVisible();
  await expect(page).toHaveURL(/\/app\/teleasistencia$/);
  await page.getByRole("button", { name: "Cancelar" }).click();
});
