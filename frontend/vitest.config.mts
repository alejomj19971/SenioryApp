import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas unitarias y de componentes (F0 §6). Los recorridos de punta a punta usan Playwright
// (`playwright.config.ts`) y viven en `pruebas/recorrido/`, que Vitest no recoge.
export default defineConfig({
  // Los alias de `tsconfig.json` (`@/…`); el JSX lo transforma Vite con el runtime automático, como Next.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["pruebas/unitarias/**/*.test.{ts,tsx}"],
    setupFiles: ["pruebas/preparar-vitest.ts"],
    // `server-only` lanza un error si se importa desde un componente cliente. En las pruebas se
    // reemplaza por un módulo vacío: aquí solo se prueba lógica, no el empaquetado.
    alias: {
      "server-only": fileURLToPath(
        new URL("./pruebas/soporte/server-only.ts", import.meta.url),
      ),
    },
  },
});
