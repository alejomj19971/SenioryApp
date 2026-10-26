import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import pg from 'pg';

// Misma versión mayor que en local (docker-compose.yml) y en el hosting.
const IMAGEN_DE_POSTGRES = 'postgres:17';

export interface BaseDeDatosDePrueba {
  readonly url: string;
  consultar<T extends pg.QueryResultRow>(
    texto: string,
    valores?: unknown[],
  ): Promise<T[]>;
  detener(): Promise<void>;
}

// Levanta un Postgres real y desechable (Testcontainers) en un puerto aleatorio.
// Requiere Docker encendido. Cada archivo de pruebas que lo use debe llamar a detener() al terminar.
export async function iniciarBaseDeDatosDePrueba(): Promise<BaseDeDatosDePrueba> {
  const contenedor: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    IMAGEN_DE_POSTGRES,
  )
    .withDatabase('seniory_prueba')
    .withUsername('seniory')
    .withPassword('seniory')
    .start();

  const url = contenedor.getConnectionUri();
  const pool = new pg.Pool({ connectionString: url, max: 2 });

  return {
    url,
    async consultar<T extends pg.QueryResultRow>(
      texto: string,
      valores: unknown[] = [],
    ): Promise<T[]> {
      const resultado = await pool.query<T>(texto, valores);
      return resultado.rows;
    },
    async detener(): Promise<void> {
      await pool.end();
      await contenedor.stop();
    },
  };
}
