import { defineConfig, devices } from "@playwright/test";

// Recorridos de punta a punta (F0 §6): la red de seguridad mientras los servicios de datos se
// reemplazan por la API, módulo por módulo. Corren contra la aplicación completa en un navegador real.
const PUERTO = Number(process.env.PUERTO_DE_RECORRIDOS ?? 3100);
const URL_BASE = `http://localhost:${PUERTO}`;

export default defineConfig({
  testDir: "./pruebas/recorrido",
  // Un recorrido toca varias pantallas y, con `next dev`, la primera visita compila cada una.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: URL_BASE,
    trace: "retain-on-failure",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },
  projects: [{ name: "movil", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // La app está pensada para el celular; el recorrido usa un viewport móvil.
    command: `npm run dev -- --port ${PUERTO}`,
    url: URL_BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
