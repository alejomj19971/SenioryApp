import { defineConfig } from 'vitest/config';

// Dos proyectos de pruebas (docs/backend/M0 §4.11):
// - unitarias: dominio y casos de uso con dobles de los puertos; sin Docker ni red (E14).
// - integracion: adaptadores contra Postgres real (Testcontainers) y pruebas de API. Requiere Docker.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    // Variables mínimas para que AppModule valide su configuración en las pruebas.
    // Nada de esto es un secreto; la base de datos de pruebas la crea Testcontainers.
    env: {
      NODE_ENV: 'test',
      URL_BASE_DE_DATOS: 'postgres://seniory:seniory@localhost:5434/seniory',
      ORIGENES_PERMITIDOS: 'http://localhost:3000',
    },
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
          // Levantar un contenedor de Postgres tarda más que una prueba normal.
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.esquema.ts',
        'src/**/migrar-cli.ts',
      ],
    },
  },
});
