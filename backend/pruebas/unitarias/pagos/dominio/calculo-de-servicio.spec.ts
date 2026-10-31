import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { Dinero } from '../../../../src/compartido/dominio/dinero.js';
import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import {
  calcularServicio,
  HORAS_MAXIMAS,
  HORAS_MINIMAS,
} from '../../../../src/pagos/dominio/calculo-de-servicio.js';
import { PoliticaDePrecios } from '../../../../src/pagos/dominio/politica-de-precios.js';

const VIGENTE_DESDE = new Date('2026-01-01T05:00:00.000Z');

function politica(familiaBps: number, profesionalBps: number) {
  return PoliticaDePrecios.crear({
    version: 1,
    comisionFamiliaBps: familiaBps,
    comisionProfesionalBps: profesionalBps,
    vigenteDesde: VIGENTE_DESDE,
  });
}

const POLITICA_V1 = politica(800, 1000);

function enPesos(desglose: ReturnType<typeof calcularServicio>) {
  return {
    subtotal: desglose.subtotal.valor,
    cargoFamilia: desglose.cargoFamilia.valor,
    totalFamilia: desglose.totalFamilia.valor,
    pagoProfesional: desglose.pagoProfesional.valor,
    ingresoPlataforma: desglose.ingresoPlataforma.valor,
  };
}

interface Vector {
  tarifaHora: number;
  horas: number;
  politica: { comisionFamiliaBps: number; comisionProfesionalBps: number };
  esperado: ReturnType<typeof enPesos>;
}

// El MISMO archivo lo usará el frontend (lib/pricing.ts) para que los dos lados no diverjan.
const { vectores } = JSON.parse(
  readFileSync(
    new URL('../../../vectores/precios.json', import.meta.url),
    'utf8',
  ),
) as { vectores: Vector[] };

describe('calcularServicio', () => {
  describe('casos conocidos', () => {
    it('$20.000 por 1 hora: la familia paga 21.600, el profesional recibe 18.000 y la plataforma 3.600', () => {
      const desglose = calcularServicio(Dinero.pesos(20_000), 1, POLITICA_V1);

      expect(enPesos(desglose)).toEqual({
        subtotal: 20_000,
        cargoFamilia: 1_600,
        totalFamilia: 21_600,
        pagoProfesional: 18_000,
        ingresoPlataforma: 3_600,
      });
    });

    it('$35.000 por 8 horas (el máximo)', () => {
      expect(
        enPesos(calcularServicio(Dinero.pesos(35_000), 8, POLITICA_V1)),
      ).toEqual({
        subtotal: 280_000,
        cargoFamilia: 22_400,
        totalFamilia: 302_400,
        pagoProfesional: 252_000,
        ingresoPlataforma: 50_400,
      });
    });

    it('la mitad se redondea hacia arriba y la comisión absorbe el redondeo: no se pierde ni se regala un peso', () => {
      // 10 % de 5 = 0,5 → 1 de comisión; al profesional le quedan 4 (y no 5).
      const desglose = calcularServicio(Dinero.pesos(5), 1, POLITICA_V1);

      expect(enPesos(desglose)).toEqual({
        subtotal: 5,
        cargoFamilia: 0, // 8 % de 5 = 0,4 → 0
        totalFamilia: 5,
        pagoProfesional: 4,
        ingresoPlataforma: 1,
      });
    });

    it('sin comisiones, todo es del profesional', () => {
      expect(
        enPesos(calcularServicio(Dinero.pesos(20_000), 3, politica(0, 0))),
      ).toEqual({
        subtotal: 60_000,
        cargoFamilia: 0,
        totalFamilia: 60_000,
        pagoProfesional: 60_000,
        ingresoPlataforma: 0,
      });
    });

    it('con comisiones del 100 %, el profesional no recibe nada y la plataforma se queda con todo', () => {
      expect(
        enPesos(
          calcularServicio(Dinero.pesos(20_000), 3, politica(10_000, 10_000)),
        ),
      ).toEqual({
        subtotal: 60_000,
        cargoFamilia: 60_000,
        totalFamilia: 120_000,
        pagoProfesional: 0,
        ingresoPlataforma: 120_000,
      });
    });
  });

  describe('vectores compartidos con el frontend', () => {
    it('hay vectores de $18.000 a $35.000 por 1 a 8 horas, y bordes', () => {
      expect(vectores.length).toBeGreaterThanOrEqual(18 * 8);
    });

    it.each(vectores)(
      '$tarifaHora × $horas h con $politica.comisionFamiliaBps/$politica.comisionProfesionalBps bps',
      (vector) => {
        const desglose = calcularServicio(
          Dinero.pesos(vector.tarifaHora),
          vector.horas,
          politica(
            vector.politica.comisionFamiliaBps,
            vector.politica.comisionProfesionalBps,
          ),
        );

        expect(enPesos(desglose)).toEqual(vector.esperado);
      },
    );
  });

  describe('invariantes (propiedades)', () => {
    const tarifa = fc.integer({ min: 1, max: 5_000_000 });
    const horas = fc.integer({ min: HORAS_MINIMAS, max: HORAS_MAXIMAS });
    const bps = fc.integer({ min: 0, max: 10_000 });

    const cualquiera = fc.tuple(tarifa, horas, bps, bps);

    it('totalFamilia = subtotal + cargo, y subtotal = tarifa × horas', () => {
      fc.assert(
        fc.property(cualquiera, ([t, h, f, p]) => {
          const d = calcularServicio(Dinero.pesos(t), h, politica(f, p));
          expect(d.subtotal.valor).toBe(t * h);
          expect(d.totalFamilia.valor).toBe(
            d.subtotal.valor + d.cargoFamilia.valor,
          );
        }),
      );
    });

    it('la plataforma nunca pierde: ingreso = total − pago ≥ 0, y el pago nunca pasa del subtotal', () => {
      fc.assert(
        fc.property(cualquiera, ([t, h, f, p]) => {
          const d = calcularServicio(Dinero.pesos(t), h, politica(f, p));
          expect(d.ingresoPlataforma.valor).toBe(
            d.totalFamilia.valor - d.pagoProfesional.valor,
          );
          expect(d.ingresoPlataforma.valor).toBeGreaterThanOrEqual(0);
          expect(d.pagoProfesional.valor).toBeLessThanOrEqual(d.subtotal.valor);
          expect(d.pagoProfesional.valor).toBeGreaterThanOrEqual(0);
        }),
      );
    });

    it('ningún peso se pierde: el ingreso de la plataforma es el cargo a la familia más la comisión al profesional', () => {
      fc.assert(
        fc.property(cualquiera, ([t, h, f, p]) => {
          const d = calcularServicio(Dinero.pesos(t), h, politica(f, p));
          const comisionProfesional =
            d.subtotal.valor - d.pagoProfesional.valor;
          expect(d.ingresoPlataforma.valor).toBe(
            d.cargoFamilia.valor + comisionProfesional,
          );
        }),
      );
    });

    it('más horas nunca cuestan menos (monótono), en todos los montos', () => {
      fc.assert(
        fc.property(
          tarifa,
          fc.integer({ min: HORAS_MINIMAS, max: HORAS_MAXIMAS - 1 }),
          bps,
          bps,
          (t, h, f, p) => {
            const menos = calcularServicio(Dinero.pesos(t), h, politica(f, p));
            const mas = calcularServicio(
              Dinero.pesos(t),
              h + 1,
              politica(f, p),
            );
            expect(mas.totalFamilia.valor).toBeGreaterThan(
              menos.totalFamilia.valor,
            );
            expect(mas.pagoProfesional.valor).toBeGreaterThanOrEqual(
              menos.pagoProfesional.valor,
            );
          },
        ),
      );
    });

    it('todo son pesos enteros, sin decimales', () => {
      fc.assert(
        fc.property(cualquiera, ([t, h, f, p]) => {
          const d = calcularServicio(Dinero.pesos(t), h, politica(f, p));
          for (const monto of Object.values(enPesos(d))) {
            expect(Number.isSafeInteger(monto)).toBe(true);
          }
        }),
      );
    });
  });

  describe('entradas inválidas', () => {
    it.each([0, -1, 9, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rechaza %s horas',
      (horas) => {
        expect(() =>
          calcularServicio(Dinero.pesos(20_000), horas, POLITICA_V1),
        ).toThrow(
          expect.objectContaining({
            constructor: ErrorDeValidacion,
            codigo: 'servicio.horas_invalidas',
          }) as Error,
        );
      },
    );

    it('rechaza una tarifa de cero', () => {
      expect(() => calcularServicio(Dinero.cero(), 1, POLITICA_V1)).toThrow(
        expect.objectContaining({
          codigo: 'servicio.tarifa_invalida',
        }) as Error,
      );
    });
  });
});
