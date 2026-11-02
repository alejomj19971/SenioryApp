import { expect, test } from "@playwright/test";

// Recorrido del cierre para producción (F10 §6 y §7): robots, sitemap, cabeceras de seguridad, páginas legales y que
// cada área protegida se quede sin su propio boundary de error. No necesita el backend: nada de esto depende de sus
// datos (la landing tampoco se rompe sin él, F7 §9).

test("robots.txt excluye las áreas con sesión y apunta al sitemap", async ({ page }) => {
  const respuesta = await page.goto("/robots.txt");
  const cuerpo = await respuesta?.text();

  expect(cuerpo).toContain("Disallow: /app");
  expect(cuerpo).toContain("Disallow: /cuidador");
  expect(cuerpo).toContain("Disallow: /admin");
  expect(cuerpo).toContain("Disallow: /api");
  expect(cuerpo).toMatch(/Sitemap: https?:\/\/.*\/sitemap\.xml/);
});

test("sitemap.xml solo trae páginas públicas", async ({ page }) => {
  const respuesta = await page.goto("/sitemap.xml");
  const cuerpo = (await respuesta?.text()) ?? "";

  // El dominio es `[^/]+` (sin barras): así «/cuidador» solo coincide como PRIMER tramo, no dentro de
  // «/registro/cuidador» (que sí es pública: ahí se postula un cuidador).
  const terminaEnLoc = (ruta: string) => new RegExp(`<loc>https?://[^/]+${ruta.replace(/\//g, "\\/")}</loc>`);
  for (const ruta of ["/ingresar", "/registro", "/registro/cuidador", "/privacidad", "/terminos", "/alcance-teleasistencia"]) {
    expect(cuerpo).toMatch(terminaEnLoc(ruta));
  }
  for (const ruta of ["/app", "/cuidador", "/admin"]) expect(cuerpo).not.toMatch(terminaEnLoc(ruta));
});

test("cada respuesta lleva las cabeceras de seguridad, incluida la que bloquea incrustarla en otro sitio", async ({ page }) => {
  const respuesta = await page.goto("/");
  const cabeceras = respuesta?.headers() ?? {};

  expect(cabeceras["content-security-policy"]).toContain("default-src 'self'");
  expect(cabeceras["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(cabeceras["x-frame-options"]).toBe("DENY");
  expect(cabeceras["x-content-type-options"]).toBe("nosniff");
  // El micrófono sigue permitido: lo usa el comando de voz.
  expect(cabeceras["permissions-policy"]).toContain("microphone=(self)");
});

test("las páginas legales existen y se llega a ellas desde el pie de la landing y del registro", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Términos y condiciones" }).click();
  await expect(page).toHaveURL(/\/terminos$/);
  await expect(page.getByRole("heading", { name: "Términos y condiciones" })).toBeVisible();
  await expect(page.getByText(/no es el empleador de los cuidadores/)).toBeVisible();
  await page.getByRole("link", { name: "página dedicada" }).click();
  await expect(page).toHaveURL(/\/alcance-teleasistencia$/);

  await page.goto("/alcance-teleasistencia");
  await expect(page.getByRole("heading", { name: "Alcance de la teleasistencia" })).toBeVisible();
  // Lo mismo que ya dice el botón de alerta dentro de la app (H7): sin línea de emergencia, siempre el 123.
  await expect(page.getByText(/no reemplaza a los servicios de emergencia/)).toBeVisible();
  await expect(page.getByText("No es una línea de emergencia", { exact: false })).toBeVisible();

  await page.goto("/registro");
  await expect(page.locator("form").getByRole("link", { name: "términos y condiciones" })).toHaveAttribute("href", "/terminos");
});

test("sin sesión, /app, /cuidador y /admin piden ingresar (cada uno con su propio error boundary listo detrás)", async ({ page }) => {
  for (const ruta of ["/app", "/cuidador", "/admin"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/ingresar/);
  }
});
