import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import {
  aplicarRolDeAplicacion,
  exigirNombreDeRol,
  sentenciasDePermisos,
} from '../../../src/compartido/infraestructura/base-de-datos/permisos.js';
import { conectarBd, nuevoId } from '../../soporte/bd.js';

// El rol con el que corre la API en producción: datos sí, estructura no. Se prueba con un rol real en un Postgres
// real, conectándose como él.
describe('rol de la aplicación (permisos mínimos)', () => {
  const dueno = conectarBd();
  const rol = `app_prueba_${randomBytes(4).toString('hex')}`;
  const clave = randomBytes(24).toString('hex');
  let app: pg.Pool;
  const tablaNueva = `permisos_${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    await aplicarRolDeAplicacion(inject('urlBdPrueba'), rol, clave);
    const url = new URL(inject('urlBdPrueba'));
    url.username = rol;
    url.password = clave;
    app = new pg.Pool({ connectionString: url.toString(), max: 2 });
  });

  afterAll(async () => {
    await app.end();
    await dueno.query(`drop table if exists pagos."${tablaNueva}"`);
    await dueno.query(`drop owned by "${rol}"`);
    await dueno.query(`drop role "${rol}"`);
    await dueno.end();
  });

  // Ejecuta algo que el rol NO debe poder hacer y devuelve el código de error de Postgres.
  async function prohibido(sentencia: string): Promise<string> {
    try {
      await app.query(sentencia);
    } catch (error) {
      return (error as { code?: string }).code ?? '';
    }
    throw new Error(`El rol pudo ejecutar: ${sentencia}`);
  }
  const SIN_PERMISO = '42501';

  it('no es superusuario ni puede crear roles ni bases de datos', async () => {
    const { rows } = await dueno.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
    }>(
      'select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname = $1',
      [rol],
    );
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: false,
    });
    expect(await prohibido('create role otro_rol_x')).toBe(SIN_PERMISO);
  });

  it('lee y escribe datos de todos los esquemas de negocio', async () => {
    const id = nuevoId();
    const codigo = `permisos-${id.slice(0, 8)}`;

    await app.query(
      `insert into pagos.paquetes_de_bolsa (codigo, horas_referencia, descuento_bps, credito, precio)
       values ($1, 5, 0, 1000, 1000)`,
      [codigo],
    );
    await app.query(
      'update pagos.paquetes_de_bolsa set activo = false where codigo = $1',
      [codigo],
    );
    const { rows } = await app.query(
      'select codigo from pagos.paquetes_de_bolsa where codigo = $1',
      [codigo],
    );
    await app.query('delete from pagos.paquetes_de_bolsa where codigo = $1', [
      codigo,
    ]);
    await app.query('select count(*) from compartido.outbox');
    await app.query('select count(*) from identidad.usuarios');
    await app.query('select count(*) from mensajeria.mensajes');

    expect(rows).toEqual([{ codigo }]);
  });

  it('no puede cambiar la estructura: crear, alterar, borrar ni vaciar tablas', async () => {
    const codigos = [
      await prohibido('create table pagos.intruso (id int)'),
      await prohibido('alter table pagos.pagos add column intruso int'),
      await prohibido('drop table pagos.pagos'),
      await prohibido('truncate pagos.pagos'),
      await prohibido('create schema intruso'),
      await prohibido(
        'drop trigger movimientos_de_bolsa_solo_insercion on pagos.movimientos_de_bolsa',
      ),
      await prohibido('create index intruso_idx on pagos.pagos (id)'),
    ];

    expect(new Set(codigos)).toEqual(new Set([SIN_PERMISO]));
  });

  it('no ve el historial de migraciones', async () => {
    expect(await prohibido('select * from drizzle.__drizzle_migrations')).toBe(
      SIN_PERMISO,
    );
  });

  it('los libros de solo inserción no se editan ni se borran, ni siquiera con este rol', async () => {
    await app.query(
      `insert into compartido.auditoria (id, accion, recurso_tipo, resultado) values ($1, 'prueba.permisos', 'rol', 'permitido')`,
      [nuevoId()],
    );

    const codigos = [
      await prohibido("update compartido.auditoria set accion = 'otra'"),
      await prohibido('delete from compartido.auditoria'),
      await prohibido('truncate compartido.auditoria'),
      await prohibido(
        'update pagos.movimientos_de_bolsa set delta_disponible = 0',
      ),
      await prohibido('delete from pagos.movimientos_de_bolsa'),
    ];

    expect(new Set(codigos)).toEqual(new Set([SIN_PERMISO]));
  });

  it('las tablas que cree una migración futura quedan cubiertas sin repetir el comando', async () => {
    await dueno.query(
      `create table pagos."${tablaNueva}" (id int primary key)`,
    );

    await app.query(`insert into pagos."${tablaNueva}" (id) values (1)`);
    const { rows } = await app.query(`select id from pagos."${tablaNueva}"`);

    expect(rows).toEqual([{ id: 1 }]);
  });

  it('aplicarlo otra vez no falla y puede cambiar la contraseña', async () => {
    const nueva = randomBytes(24).toString('hex');

    await aplicarRolDeAplicacion(inject('urlBdPrueba'), rol, nueva);
    const url = new URL(inject('urlBdPrueba'));
    url.username = rol;
    url.password = nueva;
    const otra = new pg.Pool({ connectionString: url.toString(), max: 1 });
    try {
      expect((await otra.query('select 1 as uno')).rows).toEqual([{ uno: 1 }]);
    } finally {
      await otra.end();
    }
  });

  it('rechaza nombres de rol peligrosos y contraseñas cortas', async () => {
    for (const malo of [
      'Robert"; drop table x;--',
      'con espacio',
      '',
      'A',
      'a'.repeat(64),
    ]) {
      expect(() => exigirNombreDeRol(malo)).toThrow();
    }
    await expect(
      aplicarRolDeAplicacion(inject('urlBdPrueba'), 'rol_ok', 'corta'),
    ).rejects.toThrow('16 caracteres');
  });

  it('las sentencias son un arreglo explícito y revisable', () => {
    const sentencias = sentenciasDePermisos('seniory_app', 'dueno', ['pagos']);

    expect(sentencias).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "pagos" TO "seniory_app"',
    );
    expect(
      sentencias.some((s) => /\bCREATE\b/.test(s) && s.startsWith('GRANT')),
    ).toBe(false);
    expect(sentencias).toContain(
      'REVOKE UPDATE, DELETE, TRUNCATE ON "pagos"."movimientos_de_bolsa" FROM "seniory_app"',
    );
  });
});
