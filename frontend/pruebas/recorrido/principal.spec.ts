import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { backendDisponible, crearCuenta, ipAleatoria } from "../soporte/backend-local";

// Recorrido principal (F0 §6): landing → ingresar → /app → buscar → perfil con insignias → contratar 1 hora
// (tarifa + 8 %) → confirmación → teleasistencia → alerta con cuenta regresiva.
//
// Es la red de seguridad del resto del trabajo del frontend: mientras se reemplazan los servicios de
// datos por la API, módulo por módulo, la aplicación tiene que seguir haciendo esto. Se actualiza con
// cada módulo F. Desde F1 la app pide ingresar: se usa una familia real del backend local (sin él, se omite).

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
});

// Una familia nueva con su persona y su autorización, ingresada por la pantalla de inicio de sesión.
async function ingresarComoFamilia(page: Page, context: BrowserContext, ruta: string) {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const cuenta = await crearCuenta({ nombre: "Andrea" });
  await page.goto(ruta);
  await expect(page).toHaveURL(/\/ingresar\?volver=/);
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(new RegExp(`${ruta.replaceAll("/", "\\/")}$`));
}

test("recorrido principal de una familia", async ({ page, context }) => {
  // Landing → ingresar → aplicación
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  await page.goto("/");
  await page.getByRole("link", { name: "Probar la app" }).first().click();
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fapp$/);
  const cuenta = await crearCuenta({ nombre: "Andrea" });
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Hola, Andrea" })).toBeVisible();

  // Buscar un cuidador (los de verdad: vienen del directorio del backend)
  await page.getByRole("link", { name: "Buscar cuidador" }).click();
  await expect(page).toHaveURL(/\/app\/cuidadores$/);
  const tarjeta = page.getByRole("link", { name: /Verificado/ }).first();
  await expect(tarjeta).toBeVisible();
  const nombre = (await tarjeta.locator("p").first().innerText()).trim();

  // Perfil con insignias de verificación
  await tarjeta.click();
  await expect(page).toHaveURL(/\/app\/cuidadores\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
  await expect(page.getByText("Antecedentes verificados")).toBeVisible();
  await expect(page.getByText("Títulos comprobados")).toBeVisible();

  // Contratar 1 hora: la tarifa del cuidador + 8 %
  const boton = page.getByRole("link", { name: /Contratar por horas/ });
  const tarifa = Number(((await boton.innerText()).match(/\$\s?([\d.]+)\/hora/)?.[1] ?? "").replaceAll(".", ""));
  expect(tarifa).toBeGreaterThan(0);
  // El total que muestra la pantalla: tarifa × 1,08 en pesos, con punto de miles ($ 27.000).
  const total = Math.round(tarifa * 1.08).toLocaleString("es-CO");
  await boton.click();
  await expect(page).toHaveURL(/\/app\/contratar\/[0-9a-f-]{36}$/);
  await expect(page.getByText(total).first()).toBeVisible();
  await page.getByRole("button", { name: "Confirmar contratación" }).click();

  // Confirmación
  await expect(page).toHaveURL(/\/app\/contratar\/confirmacion$/);
  await expect(page.getByRole("heading", { name: "¡Contratación confirmada!" })).toBeVisible();
  await expect(page.getByText(total).first()).toBeVisible();

  // Teleasistencia: alerta con cuenta regresiva de 5 segundos
  await page.goto("/app/teleasistencia");
  await page.getByRole("button", { name: /Enviar alerta de emergencia/ }).click();
  await expect(page.getByText(/Enviando alerta en \d/)).toBeVisible();
  await expect(page.getByText("Alerta enviada", { exact: true })).toBeVisible({ timeout: 10_000 });
});

test("cancelar la alerta antes de que termine la cuenta regresiva", async ({ page, context }) => {
  await ingresarComoFamilia(page, context, "/app/teleasistencia");
  await page.getByRole("button", { name: /Enviar alerta de emergencia/ }).click();
  await expect(page.getByText(/Enviando alerta en \d/)).toBeVisible();

  await page.getByRole("button", { name: "Cancelar" }).click();

  await expect(page.getByText(/Enviando alerta en/)).toHaveCount(0);
  await expect(page.getByText("Alerta enviada", { exact: true })).toHaveCount(0);
});
