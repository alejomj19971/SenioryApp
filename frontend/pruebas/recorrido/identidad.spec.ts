import { expect, test, type Page } from "@playwright/test";
import {
  backendDisponible,
  CONTRASENA_DE_PRUEBA,
  correoUnico,
  crearCuenta,
  ipAleatoria,
} from "../soporte/backend-local";

// Recorridos de Identidad (F1 §6) contra el BACKEND LOCAL REAL: sin él encendido se omiten con un mensaje claro.
// Cada uno usa su propia cuenta y su propia «IP» (el backend limita registro e inicio de sesión por IP).

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
});

async function ingresar(page: Page, correo: string, contrasena: string) {
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

test("registro → persona → autorización → inicio con el nombre real → salir", async ({ page, context }) => {
  const correo = correoUnico("registro");

  await page.goto("/registro");
  // Quien llega buscando postularse como cuidador lo encuentra desde aquí, no solo desde el pie de la landing.
  await expect(page.getByRole("link", { name: "Postúlate aquí" })).toHaveAttribute("href", "/registro/cuidador");
  await page.getByLabel("Tu nombre").fill("Andrea Gómez");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(CONTRASENA_DE_PRUEBA);
  await page.getByLabel(/Acepto la/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  // 1. La persona a cuidar
  await expect(page).toHaveURL(/\/bienvenida\/persona$/);
  await page.getByLabel("¿Cómo se llama?").fill("Doña Carmen");
  await page.getByLabel("Día", { exact: true }).selectOption("14");
  await page.getByLabel("Mes", { exact: true }).selectOption("3");
  await page.getByLabel("Año", { exact: true }).selectOption("1948");
  await page.getByText("Hijo o hija").click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 2. La autorización de datos de salud
  await expect(page).toHaveURL(/\/bienvenida\/consentimiento$/);
  await expect(page.getByText("Autorizo el tratamiento de los datos de salud de Doña Carmen")).toBeVisible();
  await page.getByLabel(/Autorizo el tratamiento/).check();
  await page.getByRole("button", { name: "Autorizo y continúo" }).click();

  // 3. El inicio con los nombres de verdad (no los del prototipo)
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Hola, Andrea Gómez" })).toBeVisible();
  await expect(page.getByText(/Doña Carmen/).first()).toBeVisible();

  // Ninguna cookie de sesión se ve desde JavaScript; ambas valen en todo el sitio (Path=/).
  expect(await page.evaluate(() => document.cookie)).not.toContain("seniory");
  const cookies = await context.cookies();
  for (const nombre of ["seniory_acceso", "seniory_refresco"]) {
    const cookie = cookies.find((c) => c.name === nombre);
    expect(cookie, nombre).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");
  }

  // Salir: las cookies se borran y /app vuelve a pedir ingresar
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
  expect((await context.cookies()).filter((c) => c.name.startsWith("seniory_"))).toHaveLength(0);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fapp$/);
});

test("una contraseña incorrecta da un mensaje genérico; la correcta vuelve a la ruta pedida", async ({ page }) => {
  const cuenta = await crearCuenta();

  await page.goto("/app/cuidadores");
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fapp%2Fcuidadores$/);

  await ingresar(page, cuenta.correo, "otra-clave-equivocada");
  await expect(page.getByRole("alert").filter({ hasText: "El correo o la contraseña no son correctos." })).toBeVisible();
  await expect(page.getByLabel("Correo")).toHaveValue(cuenta.correo);

  await ingresar(page, cuenta.correo, cuenta.contrasena);
  await expect(page).toHaveURL(/\/app\/cuidadores$/);
});

test("el correo repetido y la contraseña común se explican junto a su campo", async ({ page }) => {
  const cuenta = await crearCuenta({ lista: false });

  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Otra Persona");
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(CONTRASENA_DE_PRUEBA);
  await page.getByLabel(/Acepto la/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Ya existe una cuenta con ese correo. ¿Quieres ingresar?")).toBeVisible();
  await expect(page.getByLabel("Correo")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Correo").fill(correoUnico("comun"));
  await page.getByLabel("Contraseña", { exact: true }).fill("1234567890");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText(/demasiado común/)).toBeVisible();
});

test("con la cookie de acceso vencida, navegar renueva la sesión sin pedir la contraseña", async ({ page, context }) => {
  const cuenta = await crearCuenta();
  await page.goto("/ingresar");
  await ingresar(page, cuenta.correo, cuenta.contrasena);
  await expect(page).toHaveURL(/\/app$/);

  const antes = (await context.cookies()).find((c) => c.name === "seniory_acceso")?.value;
  await context.clearCookies({ name: "seniory_acceso" });

  await page.goto("/app/cuidadores");
  await expect(page).toHaveURL(/\/app\/cuidadores$/);
  const despues = (await context.cookies()).find((c) => c.name === "seniory_acceso")?.value;
  expect(despues).toBeDefined();
  expect(despues).not.toBe(antes);
});

test("quien no ha terminado la bienvenida no entra a la app", async ({ page }) => {
  const cuenta = await crearCuenta({ lista: false });
  await page.goto("/ingresar");
  await ingresar(page, cuenta.correo, cuenta.contrasena);
  // Sin persona: la bienvenida; no la app.
  await expect(page).toHaveURL(/\/bienvenida\/persona$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/bienvenida\/persona$/);
});

test("«olvidé mi contraseña» responde igual exista o no la cuenta", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: "Olvidé mi contraseña" }).click();
  await expect(page).toHaveURL(/\/recuperar$/);
  await page.getByLabel("Correo de tu cuenta").fill(correoUnico("nadie"));
  await page.getByRole("button", { name: "Enviar el enlace" }).click();
  await expect(page.getByText("Si hay una cuenta con ese correo, te enviamos un enlace")).toBeVisible();
});

test("un enlace de recuperación inválido se explica", async ({ page }) => {
  await page.goto("/restablecer-contrasena");
  await expect(page.getByText("Este enlace no es válido")).toBeVisible();

  await page.goto("/restablecer-contrasena?token=" + "x".repeat(43));
  await page.getByLabel("Contraseña nueva", { exact: true }).fill(CONTRASENA_DE_PRUEBA);
  await page.getByLabel("Repite la contraseña nueva").fill(CONTRASENA_DE_PRUEBA);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "El enlace ya no es válido o venció" })).toBeVisible();
});

test("un destino de `volver` de otro sitio se ignora", async ({ page }) => {
  const cuenta = await crearCuenta();
  await page.goto("/ingresar?volver=//otro-sitio.com");
  await ingresar(page, cuenta.correo, cuenta.contrasena);
  await expect(page).toHaveURL(/\/app$/);
});
