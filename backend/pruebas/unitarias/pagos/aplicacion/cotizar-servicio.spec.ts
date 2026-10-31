import {
  ErrorDeValidacion,
  RecursoNoEncontrado,
  ServicioNoDisponible,
} from '../../../../src/compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../../src/directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import { CotizarServicio } from '../../../../src/pagos/aplicacion/casos-de-uso/cotizar-servicio.js';
import type { CotizacionDeServicio } from '../../../../src/pagos/aplicacion/puertos/entrada/cotizador-de-servicios.js';
import type { RepositorioPoliticasDePrecios } from '../../../../src/pagos/aplicacion/puertos/salida/repositorio-politicas-de-precios.js';
import { vistaDeCotizacion } from '../../../../src/pagos/aplicacion/vistas.js';
import { PoliticaDePrecios } from '../../../../src/pagos/dominio/politica-de-precios.js';
import { RelojFalso } from '../../../soporte/dobles.js';

const CUIDADOR_ID = '0198aaaa-0000-7000-8000-000000000001';

const politica = (version: number, familia: number, profesional: number) =>
  PoliticaDePrecios.crear({
    version,
    comisionFamiliaBps: familia,
    comisionProfesionalBps: profesional,
    vigenteDesde: new Date('2026-01-01T05:00:00.000Z'),
  });

function montar(
  opciones: {
    tarifaHora?: number | null;
    politica?: PoliticaDePrecios | null;
  } = {},
) {
  const consultas: string[] = [];
  const directorio: ConsultaDeDirectorio = {
    obtenerCuidadorParaContratar: (id) => {
      consultas.push(id);
      return Promise.resolve(
        opciones.tarifaHora === null
          ? null
          : {
              id,
              nombre: 'Marta',
              tarifaHora: opciones.tarifaHora ?? 20_000,
              zona: 'Laureles',
              disponibilidad: ['manana', 'tarde'],
              aceptacionAutomatica: false,
            },
      );
    },
    obtenerContactoDeCuidador: () => Promise.resolve(null),
    obtenerCuidadorPorUsuario: () => Promise.resolve(null),
  };
  const instantes: Date[] = [];
  const politicas: RepositorioPoliticasDePrecios = {
    obtenerVigente: (ahora) => {
      instantes.push(ahora);
      return Promise.resolve(
        opciones.politica === undefined
          ? politica(1, 800, 1000)
          : opciones.politica,
      );
    },
    buscarPorVersion: () => Promise.resolve(null),
  };
  const reloj = new RelojFalso('2026-10-21T15:00:00.000Z');
  return {
    caso: new CotizarServicio(directorio, politicas, reloj),
    consultas,
    instantes,
  };
}

describe('CotizarServicio', () => {
  it('cotiza con la tarifa del directorio y las comisiones vigentes', async () => {
    const { caso } = montar();

    expect(await caso.cotizar(CUIDADOR_ID, 1)).toEqual({
      cuidadorId: CUIDADOR_ID,
      horas: 1,
      tarifaHora: 20_000,
      politicaVersion: 1,
      comisionFamiliaBps: 800,
      subtotal: 20_000,
      cargoFamilia: 1_600,
      totalFamilia: 21_600,
      pagoProfesional: 18_000,
      ingresoPlataforma: 3_600,
    });
  });

  it('usa la tarifa del cuidador, no una que venga de afuera', async () => {
    const { caso, consultas } = montar({ tarifaHora: 31_000 });

    const cotizacion = await caso.cotizar(CUIDADOR_ID, 2);

    expect(consultas).toEqual([CUIDADOR_ID]);
    expect(cotizacion.tarifaHora).toBe(31_000);
    expect(cotizacion.subtotal).toBe(62_000);
  });

  it('pregunta la política vigente en el momento de cotizar', async () => {
    const { caso, instantes } = montar();

    await caso.cotizar(CUIDADOR_ID, 1);

    expect(instantes).toEqual([new Date('2026-10-21T15:00:00.000Z')]);
  });

  it('guarda con qué versión de las comisiones se calculó', async () => {
    const { caso } = montar({ politica: politica(3, 750, 1250) });

    const cotizacion = await caso.cotizar(CUIDADOR_ID, 4);

    expect(cotizacion).toMatchObject({
      politicaVersion: 3,
      comisionFamiliaBps: 750,
      subtotal: 80_000,
      cargoFamilia: 6_000,
      pagoProfesional: 70_000,
    });
  });

  it('no cotiza a un cuidador que no se puede contratar (no existe o no está visible)', async () => {
    const { caso } = montar({ tarifaHora: null });

    await expect(caso.cotizar(CUIDADOR_ID, 1)).rejects.toMatchObject({
      constructor: RecursoNoEncontrado,
      codigo: 'cuidador.no_encontrado',
    });
  });

  it('sin política vigente no inventa comisiones: responde «no disponible»', async () => {
    const { caso } = montar({ politica: null });

    await expect(caso.cotizar(CUIDADOR_ID, 1)).rejects.toMatchObject({
      constructor: ServicioNoDisponible,
      codigo: 'cotizacion.sin_politica',
    });
  });

  it('rechaza horas fuera de 1 a 8', async () => {
    const { caso } = montar();

    for (const horas of [0, 9, 1.5]) {
      await expect(caso.cotizar(CUIDADOR_ID, horas)).rejects.toMatchObject({
        constructor: ErrorDeValidacion,
        codigo: 'servicio.horas_invalidas',
      });
    }
  });
});

describe('vistaDeCotizacion (lo que ve la familia)', () => {
  const cotizacion: CotizacionDeServicio = {
    cuidadorId: CUIDADOR_ID,
    horas: 2,
    tarifaHora: 20_000,
    politicaVersion: 1,
    comisionFamiliaBps: 800,
    subtotal: 40_000,
    cargoFamilia: 3_200,
    totalFamilia: 43_200,
    pagoProfesional: 36_000,
    ingresoPlataforma: 7_200,
  };

  it('es exactamente esto: sin el pago al profesional ni el ingreso de la plataforma', () => {
    expect(vistaDeCotizacion(cotizacion)).toEqual({
      cuidadorId: CUIDADOR_ID,
      horas: 2,
      tarifaHora: 20_000,
      subtotal: 40_000,
      cargoDeServicio: { porcentaje: 8, monto: 3_200 },
      totalFamilia: 43_200,
      politicaVersion: 1,
    });
  });

  it('ningún monto interno se cuela, ni siquiera dentro de un texto', () => {
    const texto = JSON.stringify(vistaDeCotizacion(cotizacion));

    expect(texto).not.toContain('pagoProfesional');
    expect(texto).not.toContain('ingresoPlataforma');
    expect(texto).not.toContain('36000');
    expect(texto).not.toContain('7200');
  });

  it('muestra el porcentaje legible, también con decimales', () => {
    expect(
      vistaDeCotizacion({ ...cotizacion, comisionFamiliaBps: 750 })
        .cargoDeServicio.porcentaje,
    ).toBe(7.5);
  });
});
