import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { CONFIGURACION } from '../../../configuracion/configuracion.module.js';
import type { Configuracion } from '../../../configuracion/variables-de-entorno.js';

// Símbolos de inyección. Los repositorios de cada módulo reciben BASE_DE_DATOS;
// nunca importan 'pg' ni crean su propia conexión.
export const POOL_DE_CONEXIONES = Symbol('POOL_DE_CONEXIONES');
export const BASE_DE_DATOS = Symbol('BASE_DE_DATOS');

export type BaseDeDatos = NodePgDatabase;

const MAXIMO_DE_CONEXIONES = 10;
const ESPERA_MAXIMA_DE_CONEXION_MS = 5_000;
const TIEMPO_MAXIMO_DE_CONSULTA_MS = 15_000;

@Injectable()
class CierreDeConexiones implements OnApplicationShutdown {
  constructor(@Inject(POOL_DE_CONEXIONES) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: POOL_DE_CONEXIONES,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): pg.Pool => {
        const pool = new pg.Pool({
          connectionString: configuracion.urlBaseDeDatos,
          max: MAXIMO_DE_CONEXIONES,
          connectionTimeoutMillis: ESPERA_MAXIMA_DE_CONEXION_MS,
          statement_timeout: TIEMPO_MAXIMO_DE_CONSULTA_MS,
          application_name: 'seniory-api',
        });
        // Un error en una conexión inactiva no debe tumbar el proceso.
        pool.on('error', (error) => {
          new Logger('BaseDeDatos').error(
            `Error en una conexión inactiva: ${error.message}`,
          );
        });
        return pool;
      },
    },
    {
      provide: BASE_DE_DATOS,
      inject: [POOL_DE_CONEXIONES],
      useFactory: (pool: pg.Pool): BaseDeDatos => drizzle(pool),
    },
    CierreDeConexiones,
  ],
  exports: [BASE_DE_DATOS],
})
export class BaseDeDatosModule {}
