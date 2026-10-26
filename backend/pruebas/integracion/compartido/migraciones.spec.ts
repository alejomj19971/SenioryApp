import { ejecutarMigraciones } from '../../../src/compartido/infraestructura/base-de-datos/migrar.js';
import {
  iniciarBaseDeDatosDePrueba,
  type BaseDeDatosDePrueba,
} from '../../soporte/base-de-datos-de-prueba.js';

describe('migraciones sobre un Postgres real', () => {
  let bd: BaseDeDatosDePrueba;

  beforeAll(async () => {
    bd = await iniciarBaseDeDatosDePrueba();
  });

  afterAll(async () => {
    await bd.detener();
  });

  it('crean las extensiones y el esquema compartido', async () => {
    await ejecutarMigraciones(bd.url);

    const extensiones = await bd.consultar<{ extname: string }>(
      `select extname from pg_extension where extname in ('citext', 'unaccent', 'pg_trgm') order by extname`,
    );
    const esquemas = await bd.consultar<{ schema_name: string }>(
      `select schema_name from information_schema.schemata where schema_name = 'compartido'`,
    );

    expect(extensiones.map((fila) => fila.extname)).toEqual([
      'citext',
      'pg_trgm',
      'unaccent',
    ]);
    expect(esquemas).toHaveLength(1);
  });

  it('son idempotentes: ejecutarlas de nuevo no cambia nada', async () => {
    await ejecutarMigraciones(bd.url);
    await ejecutarMigraciones(bd.url);

    const registradas = await bd.consultar<{ total: string }>(
      `select count(*)::text as total from drizzle.__drizzle_migrations`,
    );

    expect(Number(registradas[0]?.total)).toBeGreaterThanOrEqual(1);
    const hashes = await bd.consultar<{ hash: string }>(
      `select hash from drizzle.__drizzle_migrations`,
    );
    expect(new Set(hashes.map((fila) => fila.hash)).size).toBe(hashes.length);
  });

  it('dejan funcionando citext, unaccent y pg_trgm', async () => {
    await ejecutarMigraciones(bd.url);

    const [fila] = await bd.consultar<{
      igual: boolean;
      sin_tilde: string;
      similitud: number;
    }>(
      `select 'Andrea@Correo.co'::citext = 'andrea@correo.co'::citext as igual,
              unaccent('José Múnera') as sin_tilde,
              similarity('laureles', 'laurels') as similitud`,
    );

    expect(fila?.igual).toBe(true);
    expect(fila?.sin_tilde).toBe('Jose Munera');
    expect(fila?.similitud).toBeGreaterThan(0.4);
  });

  it('la base de datos rechaza un esquema inexistente sin afectar al compartido', async () => {
    await ejecutarMigraciones(bd.url);

    await expect(
      bd.consultar(`select * from esquema_que_no_existe.tabla`),
    ).rejects.toThrow();
    const esquemas = await bd.consultar(
      `select 1 from information_schema.schemata where schema_name = 'compartido'`,
    );
    expect(esquemas).toHaveLength(1);
  });
});
