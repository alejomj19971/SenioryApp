import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { backendDisponible, crearCuenta, ipAleatoria } from "../soporte/backend-local";

// Recorridos del directorio (F2 §6) contra el BACKEND LOCAL REAL con los cuidadores de las semillas
// (`npm run semillas` en backend/). Sin el backend, o sin cuidadores, se omiten.

test.beforeAll(async () => {
  test.skip(!(await backendDisponible()), "El backend local no está encendido (npm run dev en backend/).");
});

async function ingresarComoFamilia(page: Page, context: BrowserContext) {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ipAleatoria() });
  const cuenta = await crearCuenta({ nombre: "Andrea" });
  await page.goto("/app/cuidadores");
  await page.getByLabel("Correo").fill(cuenta.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/app\/cuidadores$/);
  return cuenta;
}

const tarjetas = (page: Page) => page.getByRole("link", { name: /Verificado/ });

test("la búsqueda se hace en el servidor, queda en la URL y se puede quitar", async ({ page, context }) => {
  await ingresarComoFamilia(page, context);
  await expect(tarjetas(page).first()).toBeVisible();
  test.skip((await tarjetas(page).count()) < 2, "Hacen falta al menos dos cuidadores (npm run semillas).");
  const total = await tarjetas(page).count();

  // Texto: el servidor filtra y la URL lo recuerda (se puede compartir y «atrás» funciona).
  const nombre = (await tarjetas(page).first().locator("p").first().innerText()).split(" ")[0] ?? "";
  await page.getByRole("textbox", { name: /Buscar por nombre/ }).fill(nombre.toUpperCase());
  await expect(page).toHaveURL(new RegExp(`busqueda=${encodeURIComponent(nombre.toUpperCase()).replace(/%/g, "%")}`));
  await expect(page.getByText("Buscando…")).toHaveCount(0);
  expect(await tarjetas(page).count()).toBeLessThanOrEqual(total);
  await expect(tarjetas(page).first()).toContainText(nombre);

  // Recargar conserva la búsqueda (viene de la URL)
  await page.reload();
  await expect(page.getByRole("textbox", { name: /Buscar por nombre/ })).toHaveValue(nombre.toUpperCase());
  await expect(tarjetas(page).first()).toContainText(nombre);

  // Sin resultados: se explica y se ofrece quitar los filtros
  await page.getByRole("textbox", { name: /Buscar por nombre/ }).fill("zzzzzzzz");
  await expect(page.getByText("No encontramos cuidadores con esos filtros")).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await expect(page).toHaveURL(/\/app\/cuidadores$/);
  await expect(tarjetas(page)).toHaveCount(total);
});

test("filtrar por zona deja el panel abierto y la URL con el filtro", async ({ page, context }) => {
  await ingresarComoFamilia(page, context);
  await expect(tarjetas(page).first()).toBeVisible();

  await page.getByRole("button", { name: "Mostrar u ocultar filtros" }).click();
  const zonas = page.getByRole("group", { name: "Filtrar por zona" });
  const primeraZona = zonas.getByRole("button").nth(1);
  const zona = (await primeraZona.innerText()).trim();
  await primeraZona.click();

  await expect(page).toHaveURL(new RegExp(`zona=${encodeURIComponent(zona).replace(/%/g, "%")}`));
  // El panel sigue abierto (no se remontó) y todos los resultados son de esa zona.
  await expect(zonas).toBeVisible();
  for (const tarjeta of await tarjetas(page).all()) await expect(tarjeta).toContainText(zona);
});

test("el perfil muestra la verificación y NINGÚN dato de contacto, ni en la página ni en lo que viaja al navegador", async ({ page, context }) => {
  await ingresarComoFamilia(page, context);
  const respuestas: string[] = [];
  page.on("response", async (respuesta) => {
    const tipo = respuesta.headers()["content-type"] ?? "";
    if (/text\/(html|x-component)|json/.test(tipo)) respuestas.push(await respuesta.text().catch(() => ""));
  });

  await page.goto("/app/cuidadores");
  await tarjetas(page).first().click();
  await expect(page).toHaveURL(/\/app\/cuidadores\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Antecedentes verificados")).toBeVisible();
  await expect(page.getByText("Títulos comprobados")).toBeVisible();
  await expect(page.getByText("Prueba psicotécnica aprobada")).toBeVisible();
  await expect(page.getByRole("link", { name: /Contratar por horas/ })).toBeVisible();

  const todo = [await page.content(), ...respuestas].join("\n");
  expect(todo).not.toMatch(/tel:/);
  expect(todo).not.toMatch(/\+57\d{9,10}/);
  expect(todo).not.toMatch(/"telefono"/);
});

test("un cuidador que no existe, o un id inventado, da «no encontrado»", async ({ page, context }) => {
  await ingresarComoFamilia(page, context);

  for (const id of ["00000000-0000-4000-8000-000000000000", "c-marta-restrepo", "..%2F..%2Fetc"]) {
    const respuesta = await page.goto(`/app/cuidadores/${id}`);
    expect(respuesta?.status(), id).toBe(404);
  }
});

test("la hoja de vida la entrega el servidor de Next como PDF y sin dejar ver el backend", async ({ page, context }) => {
  await ingresarComoFamilia(page, context);
  await expect(tarjetas(page).first()).toBeVisible();

  // Se busca un cuidador que tenga hoja de vida (el perfil solo ofrece el enlace si existe).
  const enlaces = await tarjetas(page).evaluateAll((nodos) => nodos.map((nodo) => (nodo as HTMLAnchorElement).href));
  let hoja: string | null = null;
  let sinHoja: string | null = null;
  for (const enlace of enlaces) {
    await page.goto(enlace);
    const id = enlace.split("/").at(-1) as string;
    if ((await page.getByRole("link", { name: /Hoja de vida/ }).count()) > 0) hoja ??= id;
    else sinHoja ??= id;
    if (hoja !== null && sinHoja !== null) break;
  }
  test.skip(hoja === null, "Ningún cuidador de las semillas tiene hoja de vida (npm run cuidadores:importar con un PDF).");

  // El enlace apunta a Next, no al backend
  await page.goto(`/app/cuidadores/${hoja}`);
  const href = await page.getByRole("link", { name: /Hoja de vida/ }).getAttribute("href");
  expect(href).toBe(`/api/cuidadores/${hoja}/hoja-de-vida`);

  const pdf = await page.request.get(href as string);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["cache-control"]).toContain("no-store");
  expect(pdf.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Quien no tiene hoja de vida no ofrece el enlace, y la ruta responde 404
  if (sinHoja !== null) {
    await page.goto(`/app/cuidadores/${sinHoja}`);
    await expect(page.getByRole("link", { name: /Hoja de vida/ })).toHaveCount(0);
    expect((await page.request.get(`/api/cuidadores/${sinHoja}/hoja-de-vida`)).status()).toBe(404);
  }
  expect((await page.request.get("/api/cuidadores/no-es-uuid/hoja-de-vida")).status()).toBe(404);
});

test("sin sesión, el directorio y la hoja de vida piden ingresar", async ({ page }) => {
  await page.goto("/app/cuidadores");
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fapp%2Fcuidadores$/);

  await page.goto("/api/cuidadores/00000000-0000-4000-8000-000000000000/hoja-de-vida");
  await expect(page).toHaveURL(/\/ingresar\?volver=/);
});
