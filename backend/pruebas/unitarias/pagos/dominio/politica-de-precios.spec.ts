import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import { PoliticaDePrecios } from '../../../../src/pagos/dominio/politica-de-precios.js';

const BASE = {
  version: 1,
  comisionFamiliaBps: 800,
  comisionProfesionalBps: 1000,
  vigenteDesde: new Date('2026-01-01T05:00:00.000Z'),
};

describe('PoliticaDePrecios', () => {
  it('guarda sus datos', () => {
    const politica = PoliticaDePrecios.crear(BASE);

    expect(politica.version).toBe(1);
    expect(politica.comisionFamiliaBps).toBe(800);
    expect(politica.comisionProfesionalBps).toBe(1000);
    expect(politica.vigenteDesde).toEqual(BASE.vigenteDesde);
  });

  it('acepta los extremos: 0 % y 100 %', () => {
    expect(() =>
      PoliticaDePrecios.crear({
        ...BASE,
        comisionFamiliaBps: 0,
        comisionProfesionalBps: 10_000,
      }),
    ).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN])('rechaza la versión %s', (version) => {
    expect(() => PoliticaDePrecios.crear({ ...BASE, version })).toThrow(
      expect.objectContaining({
        constructor: ErrorDeValidacion,
        codigo: 'politica.version_invalida',
      }) as Error,
    );
  });

  it.each([-1, 10_001, 7.5, Number.NaN])(
    'rechaza una comisión de %s puntos básicos',
    (bps) => {
      for (const campo of [
        'comisionFamiliaBps',
        'comisionProfesionalBps',
      ] as const) {
        expect(() =>
          PoliticaDePrecios.crear({ ...BASE, [campo]: bps }),
        ).toThrow(
          expect.objectContaining({
            codigo: 'politica.comision_invalida',
          }) as Error,
        );
      }
    },
  );

  it('rechaza una fecha de vigencia inválida', () => {
    expect(() =>
      PoliticaDePrecios.crear({ ...BASE, vigenteDesde: new Date('nada') }),
    ).toThrow(
      expect.objectContaining({
        codigo: 'politica.vigencia_invalida',
      }) as Error,
    );
  });

  it('no cambia si se modifica el objeto con el que se creó', () => {
    const datos = { ...BASE, vigenteDesde: new Date(BASE.vigenteDesde) };
    const politica = PoliticaDePrecios.crear(datos);

    datos.comisionFamiliaBps = 9_999;

    expect(politica.comisionFamiliaBps).toBe(800);
  });
});
