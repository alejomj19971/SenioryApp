import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const CARPETA_DE_MIGRACIONES = 'drizzle';

// Un host que no sea local (desarrollo con Docker) exige TLS para conectarse desde fuera de la red del
// proveedor; si no se pide, el servidor corta la conexión a mitad de la primera consulta (ECONNRESET), un
// error que no dice nada de SSL. `rejectUnauthorized: false` porque el certificado de Render no es el de
// una CA pública reconocida por Node.
export function sslSiHaceFalta(urlBaseDeDatos: string): boolean | { rejectUnauthorized: false } {
  const host = new URL(urlBaseDeDatos).hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? false
    : { rejectUnauthorized: false };
}

// Aplica las migraciones pendientes. Es idempotente: ejecutarla dos veces no cambia nada.
// Usa su propia conexión (no el pool de la aplicación) y sin límite de tiempo por consulta,
// porque una migración puede tardar más que una petición normal.
export async function ejecutarMigraciones(
  urlBaseDeDatos: string,
  carpeta: string = CARPETA_DE_MIGRACIONES,
): Promise<void> {
  const pool = new pg.Pool({
    connectionString: urlBaseDeDatos,
    max: 1,
    application_name: 'seniory-migraciones',
    ssl: sslSiHaceFalta(urlBaseDeDatos),
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: carpeta });
  } finally {
    await pool.end();
  }
}
