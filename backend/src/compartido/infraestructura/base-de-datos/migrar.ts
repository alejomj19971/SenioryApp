import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const CARPETA_DE_MIGRACIONES = 'drizzle';

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
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: carpeta });
  } finally {
    await pool.end();
  }
}
