import { ejecutarMigraciones } from './migrar.js';

// Comando: npm run bd:migrar  (también lo usa el despliegue antes de arrancar la API).
// Migra con la cuenta DUEÑA de las tablas (URL_BASE_DE_DATOS_MIGRACIONES); si no se define, con la misma de la API
// (desarrollo). En producción la API usa un rol sin permiso para cambiar la estructura (`npm run bd:permisos`).
const url =
  process.env.URL_BASE_DE_DATOS_MIGRACIONES ?? process.env.URL_BASE_DE_DATOS;
if (!url) {
  console.error(
    'Falta URL_BASE_DE_DATOS_MIGRACIONES (o URL_BASE_DE_DATOS): no se puede migrar.',
  );
  process.exit(1);
}

try {
  await ejecutarMigraciones(url);
  console.log('Migraciones aplicadas.');
} catch (error) {
  console.error(
    'Falló la migración:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
