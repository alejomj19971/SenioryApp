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
      SECRETO_JWT_ACCESO: 'secreto-jwt-solo-para-pruebas-0123456789',
      COOKIES_SEGURAS: 'false',
      // Las pruebas que arrancan la aplicación completa no deben procesar eventos de ninguna base;
      // las pruebas del outbox controlan el despachador directamente.
      INTERVALO_SONDEO_OUTBOX_MS: '0',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unitarias',
          include: [
            'pruebas/unitarias/**/*.spec.ts',
            // Reglas de arquitectura: no necesitan Docker (M0 §4.9).
            'pruebas/arquitectura/**/*.spec.ts',
          ],
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
          // Un Postgres real y desechable por corrida, con todas las migraciones aplicadas.
          globalSetup: ['pruebas/soporte/global-setup-bd.ts'],
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
      // Umbrales de M0 §4.11: `npm run test:cobertura` falla si bajan.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
        'src/compartido/dominio/**': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 90,
        },
        // El dominio de cada módulo de negocio mantiene el mismo umbral que el compartido.
        'src/identidad/dominio/**': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 90,
        },
      },
    },
  },
});
