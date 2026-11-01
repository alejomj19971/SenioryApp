import { defineConfig } from "vitest/config";

// Pruebas de CONTRATO (INTEGRACION §6): llaman al backend local real. Aparte de las unitarias porque necesitan el
// backend encendido (`npm run dev` en backend/); si no lo está, se omiten con un mensaje claro.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: true,
    include: ["pruebas/contrato/**/*.test.ts"],
    testTimeout: 30_000,
    // Cada prueba crea sus cuentas; en serie para no competir por el límite de peticiones del backend.
    fileParallelism: false,
  },
});
