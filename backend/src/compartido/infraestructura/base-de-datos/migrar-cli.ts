import { ejecutarMigraciones } from './migrar.js';

// Comando: npm run bd:migrar  (también lo usa el despliegue antes de arrancar la API).
const url = process.env.URL_BASE_DE_DATOS;
if (!url) {
  console.error('Falta la variable URL_BASE_DE_DATOS: no se puede migrar.');
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
