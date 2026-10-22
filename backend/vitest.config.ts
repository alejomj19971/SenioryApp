import { defineConfig } from 'vitest/config';

// Dos proyectos de pruebas (docs/backend/M0 §4.11):
// - unitarias: dominio y casos de uso con dobles de los puertos; sin Docker ni red (E14).
// - integracion: adaptadores contra Postgres real (Testcontainers) y pruebas de API.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    projects: [
      {
        extends: true,
        test: {
          name: 'unitarias',
          include: ['pruebas/unitarias/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          include: [
            'pruebas/integracion/**/*.spec.ts',
            'pruebas/api/**/*.spec.ts',
          ],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.module.ts'],
    },
  },
});
