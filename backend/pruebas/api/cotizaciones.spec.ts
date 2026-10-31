import type { NestExpressApplication } from '@nestjs/platform-express';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { CrearAdministrador } from '../../src/identidad/aplicacion/casos-de-uso/crear-administrador.js';
import { ImportarCuidador } from '../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import type { EntradaDeCuidadorImportado } from '../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import {
  como,
  conSesion,
  CONTRASENA,
  registrarFamiliar,
  sesionDe,
  SECRETO_BFF,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import { REVISOR_DE_PRUEBA } from '../soporte/directorio.js';

// M3 §6 (API): cotizar un servicio. Lo que más importa: la tarifa y las comisiones las pone el servidor, y
// la familia nunca ve lo que se le paga al profesional.

const INICIO = '2030-06-10T15:00:00.000Z';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();
const RUTA = '/api/v1/pagos/cotizaciones';

function entrada(tarifaHora: number): EntradaDeCuidadorImportado {
  const marca = nuevoId().slice(0, 8);
  return {
    nombre: `Marta ${marca}`,
    correo: `${marca}@cuidadores.seniory.invalid`,
    telefono: '+573104445566',
    especialidad: 'enfermeria',
    titulo: 'Enfermera profesional',
    aniosExperiencia: 6,
    tarifaHora,
    zona: `Zona${marca}`,
    disponibilidad: ['manana'],
    bio: 'Cuido con paciencia.',
    controles: [
      { control: 'antecedentes', vigenteHasta: '2031-01-01' },
      { control: 'titulos', vigenteHasta: null },
      { control: 'psicotecnica', vigenteHasta: '2031-01-01' },
    ],
  };
}

describe('cotizaciones (API)', () => {
  let app: NestExpressApplication;
  let cookie: string;
  const versionesInsertadas: number[] = [];

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: { SECRETO_BFF },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
    cookie = conSesion((await registrarFamiliar(como(app))).sesion);
  });

  afterAll(async () => {
    if (versionesInsertadas.length > 0) {
      await bd.query(
        'delete from pagos.politicas_de_precios where version = any($1::int[])',
        [versionesInsertadas],
      );
    }
    await app.close();
    await bd.end();
  });

  beforeEach(() => reloj.fijar(INICIO));

  const importar = (tarifaHora: number) =>
    app
      .get(ImportarCuidador, { strict: false })
      .ejecutar(entrada(tarifaHora), REVISOR_DE_PRUEBA);
  const cotizar = (cuerpo: unknown, galleta = cookie) =>
    como(app)
      .post(RUTA)
      .set('Cookie', galleta)
      .send(cuerpo as object);

  it('$20.000 por 1 hora: total 21.600, y la familia no ve lo que se le paga al profesional', async () => {
    const { cuidadorId } = await importar(20_000);

    const respuesta = await cotizar({ cuidadorId, horas: 1 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      cotizacion: {
        cuidadorId,
        horas: 1,
        tarifaHora: 20_000,
        subtotal: 20_000,
        cargoDeServicio: { porcentaje: 8, monto: 1_600 },
        totalFamilia: 21_600,
        politicaVersion: 1,
      },
    });
    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain('18000');
    expect(texto).not.toContain('3600');
    expect(texto).not.toMatch(/profesional|plataforma/i);
  });

  it.each([
    [18_000, 1, 19_440],
    [27_000, 3, 87_480],
    [35_000, 8, 302_400],
  ])('$%i por %i h cuesta %i', async (tarifa, horas, total) => {
    const { cuidadorId } = await importar(tarifa);

    const respuesta = await cotizar({ cuidadorId, horas });

    expect(
      (respuesta.body as { cotizacion: { totalFamilia: number } }).cotizacion
        .totalFamilia,
    ).toBe(total);
  });

  it('el cliente no puede poner la tarifa ni las comisiones: los campos extra se rechazan', async () => {
    const { cuidadorId } = await importar(20_000);

    for (const extra of [
      { tarifaHora: 1 },
      { comisionFamiliaBps: 0 },
      { totalFamilia: 1 },
      { politicaVersion: 1 },
    ]) {
      const respuesta = await cotizar({ cuidadorId, horas: 1, ...extra });
      expect(respuesta.status).toBe(400);
    }
  });

  it.each([
    ['cero horas', 0],
    ['nueve horas', 9],
    ['horas negativas', -2],
    ['horas con decimales', 1.5],
    ['horas en texto', '2'],
    ['horas nulas', null],
  ])('rechaza %s con 400', async (_nombre, horas) => {
    const { cuidadorId } = await importar(20_000);

    const respuesta = await cotizar({ cuidadorId, horas });

    expect(respuesta.status).toBe(400);
  });

  it.each([
    ['sin cuidador', { horas: 1 }],
    ['un cuidador que no es UUID', { cuidadorId: 'marta', horas: 1 }],
    ['un cuerpo vacío', {}],
  ])('rechaza %s con 400', async (_nombre, cuerpo) => {
    expect((await cotizar(cuerpo)).status).toBe(400);
  });

  it('un cuidador que no existe o que no se muestra es 404, igual en los dos casos', async () => {
    const { cuidadorId } = await importar(20_000);
    await bd.query(
      `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
      [cuidadorId],
    );

    const oculto = await cotizar({ cuidadorId, horas: 1 });
    const inexistente = await cotizar({ cuidadorId: nuevoId(), horas: 1 });

    expect(oculto.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(oculto.body).toMatchObject({ codigo: 'cuidador.no_encontrado' });
  });

  it('sin sesión es 401', async () => {
    const respuesta = await como(app)
      .post(RUTA)
      .send({ cuidadorId: nuevoId(), horas: 1 });

    expect(respuesta.status).toBe(401);
  });

  it('un administrador no cotiza como familia: 403', async () => {
    const correo = `${nuevoId()}@admin.seniory.invalid`;
    await app.get(CrearAdministrador, { strict: false }).ejecutar({
      nombre: 'Laura Administradora',
      correo,
      contrasena: CONTRASENA,
    });
    const login = await como(app)
      .post('/api/v1/auth/login')
      .send({ correo, contrasena: CONTRASENA });
    const { cuidadorId } = await importar(20_000);

    const respuesta = await cotizar(
      { cuidadorId, horas: 1 },
      conSesion(sesionDe(login)),
    );

    expect(respuesta.status).toBe(403);
  });

  it('cuando cambian las comisiones, cotiza con la nueva versión desde su fecha y no antes', async () => {
    const version = 800_000_000 + Math.floor(Math.random() * 1_000_000);
    await bd.query(
      `insert into pagos.politicas_de_precios (version, comision_familia_bps, comision_profesional_bps, vigente_desde)
       values ($1, 1000, 1500, '2030-09-01T05:00:00Z')`,
      [version],
    );
    versionesInsertadas.push(version);
    const { cuidadorId } = await importar(20_000);
    const montos = async (galleta: string) =>
      (
        (await cotizar({ cuidadorId, horas: 1 }, galleta)).body as {
          cotizacion: {
            totalFamilia: number;
            politicaVersion: number;
            cargoDeServicio: { porcentaje: number };
          };
        }
      ).cotizacion;

    const antes = await montos(cookie);
    reloj.fijar('2030-09-02T15:00:00.000Z');
    // La sesión del 10 de junio ya venció: entra una nueva.
    const nueva = conSesion((await registrarFamiliar(como(app))).sesion);
    const despues = await montos(nueva);

    expect(antes).toMatchObject({ totalFamilia: 21_600, politicaVersion: 1 });
    expect(despues).toMatchObject({
      totalFamilia: 22_000,
      politicaVersion: version,
      cargoDeServicio: { porcentaje: 10 },
    });
  });
});
