import { conectarBd } from '../../soporte/bd.js';

const ESQUEMAS = [
  'compartido',
  'identidad',
  'directorio',
  'pagos',
  'reservas',
  'notificaciones',
  'teleasistencia',
  'mensajeria',
];

// Convenciones de docs/backend/BASE_DE_DATOS.md §2 que se verifican sobre la base REAL:
// si alguien las rompe en una migración futura, esta prueba falla.
describe('estructura de la base de datos', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  const consultar = async <T extends object>(texto: string): Promise<T[]> =>
    (await bd.query<T>(texto, [ESQUEMAS])).rows;

  it('tiene exactamente los 8 esquemas de módulo y 38 tablas', async () => {
    const filas = await consultar<{ esquema: string; tablas: string }>(
      `select table_schema as esquema, count(*)::text as tablas
         from information_schema.tables
        where table_schema = any($1) and table_type = 'BASE TABLE'
        group by 1 order by 1`,
    );

    expect(
      Object.fromEntries(filas.map((f) => [f.esquema, Number(f.tablas)])),
    ).toEqual({
      compartido: 3,
      directorio: 4,
      identidad: 8,
      mensajeria: 2,
      notificaciones: 3,
      pagos: 8,
      reservas: 4,
      teleasistencia: 6,
    });
  });

  it('NO tiene claves foráneas entre esquemas (E13: cada módulo es dueño de sus datos)', async () => {
    const filas = await consultar<{ origen: string; destino: string }>(
      `select a.relnamespace::regnamespace::text || '.' || a.relname as origen,
              b.relnamespace::regnamespace::text || '.' || b.relname as destino
         from pg_constraint c
         join pg_class a on a.oid = c.conrelid
         join pg_class b on b.oid = c.confrelid
        where c.contype = 'f' and a.relnamespace <> b.relnamespace
          and a.relnamespace::regnamespace::text = any($1)`,
    );

    expect(filas).toEqual([]);
  });

  it('toda tabla tiene clave primaria', async () => {
    const filas = await consultar<{ tabla: string }>(
      `select t.table_schema || '.' || t.table_name as tabla
         from information_schema.tables t
        where t.table_schema = any($1) and t.table_type = 'BASE TABLE'
          and not exists (
            select 1 from information_schema.table_constraints c
             where c.table_schema = t.table_schema and c.table_name = t.table_name
               and c.constraint_type = 'PRIMARY KEY')`,
    );

    expect(filas).toEqual([]);
  });

  it('nunca usa decimales de coma flotante ni numeric: el dinero va en enteros', async () => {
    const filas = await consultar<{ columna: string; tipo: string }>(
      `select table_schema || '.' || table_name || '.' || column_name as columna, data_type as tipo
         from information_schema.columns
        where table_schema = any($1)
          and data_type in ('real', 'double precision', 'numeric', 'money')`,
    );

    expect(filas).toEqual([]);
  });

  it('todos los instantes llevan zona horaria (timestamptz)', async () => {
    const filas = await consultar<{ columna: string }>(
      `select table_schema || '.' || table_name || '.' || column_name as columna
         from information_schema.columns
        where table_schema = any($1) and data_type = 'timestamp without time zone'`,
    );

    expect(filas).toEqual([]);
  });

  it('todas las columnas de dinero (_bps aparte) son bigint', async () => {
    const filas = await consultar<{ columna: string; tipo: string }>(
      `select table_schema || '.' || table_name || '.' || column_name as columna, data_type as tipo
         from information_schema.columns
        where table_schema = any($1)
          and (column_name ~ '(^|_)(monto|subtotal|total|saldo|precio|credito|tarifa)(_|$)'
               or column_name in ('pago_profesional', 'ingreso_plataforma', 'cargo_familia'))
          and data_type <> 'bigint'
          and column_name not like '%codigo%' and column_name not like '%_en'
          and column_name not like 'total_%_id'`,
    );

    // `cantidad_*`, `*_id` y similares no son dinero y no entran en el patrón.
    expect(filas).toEqual([]);
  });

  it('tiene las reglas de integridad: CHECK, UNIQUE y claves foráneas dentro de cada esquema', async () => {
    const [fila] = await consultar<{
      checks: string;
      unicas: string;
      foraneas: string;
    }>(
      `select count(*) filter (where contype = 'c')::text as checks,
              count(*) filter (where contype = 'u')::text as unicas,
              count(*) filter (where contype = 'f')::text as foraneas
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        where n.nspname = any($1)`,
    );

    expect(Number(fila?.checks)).toBeGreaterThanOrEqual(90);
    expect(Number(fila?.unicas)).toBeGreaterThanOrEqual(19);
    expect(Number(fila?.foraneas)).toBeGreaterThanOrEqual(25);
  });

  it('las extensiones de búsqueda están disponibles', async () => {
    const filas = await consultar<{ extname: string }>(
      `select extname from pg_extension where extname in ('citext', 'unaccent', 'pg_trgm') and $1::text[] is not null`,
    );

    expect(filas.map((f) => f.extname).sort()).toEqual([
      'citext',
      'pg_trgm',
      'unaccent',
    ]);
  });
});
