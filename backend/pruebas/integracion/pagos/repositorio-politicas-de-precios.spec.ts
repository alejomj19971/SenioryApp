import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { RepositorioPoliticasDePreciosDrizzle } from '../../../src/pagos/infraestructura/salida/persistencia/repositorio-politicas-de-precios-drizzle.js';
import { conectarDrizzle } from '../../soporte/bd.js';

// Las políticas de precios contra Postgres real. La versión 1 (8 % y 10 %) viene de la migración: producción
// la necesita para poder cotizar. La base se comparte con otras pruebas, así que las versiones que esta
// inserta tienen fechas lejanas (que ninguna otra usa) y se borran al terminar.
describe('RepositorioPoliticasDePreciosDrizzle', () => {
  const { pool, bd } = conectarDrizzle();
  const repositorio = new RepositorioPoliticasDePreciosDrizzle(
    new ContextoTransaccional(bd),
  );
  const versionesInsertadas: number[] = [];

  async function insertar(
    version: number,
    familia: number,
    profesional: number,
    vigenteDesde: string,
  ) {
    await pool.query(
      `insert into pagos.politicas_de_precios (version, comision_familia_bps, comision_profesional_bps, vigente_desde)
       values ($1, $2, $3, $4)`,
      [version, familia, profesional, vigenteDesde],
    );
    versionesInsertadas.push(version);
  }

  // Un rango de versiones propio de esta prueba, lejos de la 1.
  const base = 700_000_000 + Math.floor(Math.random() * 1_000_000) * 10;

  afterAll(async () => {
    if (versionesInsertadas.length > 0) {
      await pool.query(
        'delete from pagos.politicas_de_precios where version = any($1::int[])',
        [versionesInsertadas],
      );
    }
    await pool.end();
  });

  it('la versión 1 viene de la migración: 8 % a la familia y 10 % al profesional', async () => {
    const politica = await repositorio.buscarPorVersion(1);

    expect(politica).toMatchObject({
      version: 1,
      comisionFamiliaBps: 800,
      comisionProfesionalBps: 1000,
    });
  });

  it('una versión que no existe devuelve null', async () => {
    expect(await repositorio.buscarPorVersion(base)).toBeNull();
  });

  it('la vigente es la de comienzo más reciente que ya empezó', async () => {
    await insertar(base + 1, 900, 1100, '2040-01-01T05:00:00Z');

    const antes = await repositorio.obtenerVigente(
      new Date('2039-12-31T23:59:59Z'),
    );
    const despues = await repositorio.obtenerVigente(
      new Date('2040-01-01T05:00:00Z'),
    );

    expect(antes?.version).toBe(1);
    expect(despues).toMatchObject({
      version: base + 1,
      comisionFamiliaBps: 900,
      comisionProfesionalBps: 1100,
    });
  });

  it('una política que todavía no empieza no rige', async () => {
    await insertar(base + 2, 100, 100, '2045-06-01T05:00:00Z');

    const vigente = await repositorio.obtenerVigente(
      new Date('2045-05-31T05:00:00Z'),
    );

    expect(vigente?.version).not.toBe(base + 2);
  });

  it('si dos empiezan en el mismo instante, gana la versión más nueva', async () => {
    await insertar(base + 3, 300, 300, '2050-01-01T05:00:00Z');
    await insertar(base + 4, 400, 400, '2050-01-01T05:00:00Z');

    const vigente = await repositorio.obtenerVigente(
      new Date('2050-01-02T05:00:00Z'),
    );

    expect(vigente?.version).toBe(base + 4);
  });

  it('antes de la primera política no hay ninguna vigente', async () => {
    expect(
      await repositorio.obtenerVigente(new Date('2020-01-01T00:00:00Z')),
    ).toBeNull();
  });

  it('la base rechaza una comisión mayor al 100 %', async () => {
    await expect(
      pool.query(
        `insert into pagos.politicas_de_precios (version, comision_familia_bps, comision_profesional_bps, vigente_desde)
         values ($1, 10001, 0, now())`,
        [base + 5],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
