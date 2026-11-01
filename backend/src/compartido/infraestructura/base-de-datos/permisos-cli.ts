import { aplicarRolDeAplicacion } from './permisos.js';

// Comando: npm run bd:permisos  (después de CADA migración, en el despliegue).
//
// Crea o actualiza el rol con el que corre la API y le da solo los permisos de datos. Se ejecuta con la cuenta
// DUEÑA de las tablas (la misma de las migraciones):
//   URL_BASE_DE_DATOS_MIGRACIONES   cuenta dueña (si falta, usa URL_BASE_DE_DATOS)
//   ROL_DE_APLICACION               nombre del rol (por defecto seniory_app)
//   CLAVE_DEL_ROL_DE_APLICACION     su contraseña (16 caracteres o más)
// Después, la API arranca con URL_BASE_DE_DATOS apuntando a ese rol.
const url =
  process.env.URL_BASE_DE_DATOS_MIGRACIONES ?? process.env.URL_BASE_DE_DATOS;
const rol = process.env.ROL_DE_APLICACION ?? 'seniory_app';
const clave = process.env.CLAVE_DEL_ROL_DE_APLICACION;

if (!url || !clave) {
  console.error(
    'Faltan URL_BASE_DE_DATOS_MIGRACIONES (o URL_BASE_DE_DATOS) y CLAVE_DEL_ROL_DE_APLICACION.',
  );
  process.exit(1);
}

try {
  const { esquemas } = await aplicarRolDeAplicacion(url, rol, clave);
  console.log(
    `Rol ${rol} listo: datos de lectura y escritura en ${esquemas.join(', ')}; sin permiso para cambiar la estructura.`,
  );
} catch (error) {
  console.error(
    'No se pudieron aplicar los permisos:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
