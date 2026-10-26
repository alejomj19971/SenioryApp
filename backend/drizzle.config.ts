import { defineConfig } from 'drizzle-kit';

// Cada módulo declara su esquema en `*.esquema.ts` dentro de su propia carpeta de persistencia.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/*.esquema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.URL_BASE_DE_DATOS ?? '',
  },
});
