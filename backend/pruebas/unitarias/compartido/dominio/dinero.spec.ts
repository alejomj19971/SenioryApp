import fc from 'fast-check';
import { Dinero } from '../../../../src/compartido/dominio/dinero.js';
import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';

// Montos realistas: hasta mil millones de pesos, para que las sumas no se salgan del rango seguro.
const monto = fc
  .integer({ min: 0, max: 1_000_000_000 })
  .map((pesos) => Dinero.pesos(pesos));
const puntosBasicos = fc.integer({ min: 0, max: 10_000 });

describe('Dinero', () => {
  describe('creación', () => {
    it('guarda un monto entero de pesos', () => {
      expect(Dinero.pesos(25_000).valor).toBe(25_000);
      expect(Dinero.cero().valor).toBe(0);
    });

    it.each([
      ['negativo', -1],
      ['con decimales', 1500.5],
      ['NaN', Number.NaN],
      ['infinito', Number.POSITIVE_INFINITY],
      ['más allá del entero seguro', Number.MAX_SAFE_INTEGER + 1],
    ])('rechaza un monto %s', (_nombre, valor) => {
      expect(() => Dinero.pesos(valor)).toThrow(ErrorDeValidacion);
    });

    it('el error dice el código y el valor recibido', () => {
      expect(() => Dinero.pesos(-5)).toThrow(
        expect.objectContaining({
          codigo: 'dinero.monto_invalido',
          message: expect.stringContaining('-5'),
        }),
      );
    });
  });

  describe('suma y resta', () => {
    it('suma y resta montos', () => {
      expect(Dinero.pesos(100_000).sumar(Dinero.pesos(8_000)).valor).toBe(
        108_000,
      );
      expect(Dinero.pesos(108_000).restar(Dinero.pesos(18_000)).valor).toBe(
        90_000,
      );
    });

    it('restar hasta cero está permitido, pero no por debajo', () => {
      expect(Dinero.pesos(500).restar(Dinero.pesos(500)).valor).toBe(0);
      expect(() => Dinero.pesos(500).restar(Dinero.pesos(501))).toThrow(
        expect.objectContaining({ codigo: 'dinero.negativo' }),
      );
    });

    it('es inmutable: operar no cambia el original', () => {
      const saldo = Dinero.pesos(1_000);
      saldo.sumar(Dinero.pesos(500));
      saldo.restar(Dinero.pesos(500));
      expect(saldo.valor).toBe(1_000);
    });

    it('propiedad: la suma es conmutativa y asociativa', () => {
      fc.assert(
        fc.property(monto, monto, monto, (a, b, c) => {
          expect(a.sumar(b).igualA(b.sumar(a))).toBe(true);
          expect(
            a
              .sumar(b)
              .sumar(c)
              .igualA(a.sumar(b.sumar(c))),
          ).toBe(true);
        }),
      );
    });

    it('propiedad: sumar y luego restar lo mismo devuelve el monto original', () => {
      fc.assert(
        fc.property(monto, monto, (a, b) => {
          expect(a.sumar(b).restar(b).igualA(a)).toBe(true);
        }),
      );
    });

    it('propiedad: restar más de lo que hay siempre falla', () => {
      fc.assert(
        fc.property(monto, fc.integer({ min: 1, max: 1_000 }), (a, extra) => {
          expect(() => a.restar(Dinero.pesos(a.valor + extra))).toThrow(
            ErrorDeValidacion,
          );
        }),
      );
    });
  });

  describe('multiplicarPor', () => {
    it('multiplica la tarifa por las horas', () => {
      expect(Dinero.pesos(25_000).multiplicarPor(4).valor).toBe(100_000);
      expect(Dinero.pesos(25_000).multiplicarPor(0).valor).toBe(0);
    });

    it.each([[-1], [1.5], [Number.NaN]])('rechaza el factor %s', (factor) => {
      expect(() => Dinero.pesos(25_000).multiplicarPor(factor)).toThrow(
        expect.objectContaining({ codigo: 'dinero.factor_invalido' }),
      );
    });

    it('rechaza un resultado que pierde precisión', () => {
      expect(() =>
        Dinero.pesos(Number.MAX_SAFE_INTEGER).multiplicarPor(2),
      ).toThrow(ErrorDeValidacion);
    });
  });

  describe('porcentaje (puntos básicos)', () => {
    it('el 8 % (800 bps) de 20 000 es 1 600', () => {
      expect(Dinero.pesos(20_000).porcentaje(800).valor).toBe(1_600);
    });

    it('reproduce el desglose de la política v1: 8 % a la familia y 10 % al cuidador', () => {
      const subtotal = Dinero.pesos(25_000).multiplicarPor(4);
      const cargoFamilia = subtotal.porcentaje(800);
      const total = subtotal.sumar(cargoFamilia);
      const pagoProfesional = subtotal.restar(subtotal.porcentaje(1_000));
      expect([
        cargoFamilia.valor,
        total.valor,
        pagoProfesional.valor,
        total.restar(pagoProfesional).valor,
      ]).toEqual([8_000, 108_000, 90_000, 18_000]);
    });

    it.each([
      // [pesos, bps, esperado]: la mitad exacta sube; menos de la mitad baja
      [1, 5_000, 1], // 0,5 → 1
      [3, 5_000, 2], // 1,5 → 2
      [1, 4_999, 0], // 0,4999 → 0
      [18_750, 800, 1_500], // exacto
      [18_757, 800, 1_501], // 1500,56 → 1501
      [18_756, 800, 1_500], // 1500,48 → 1500
    ])(
      'redondea mitad hacia arriba: %i pesos × %i bps = %i',
      (pesos, bps, esperado) => {
        expect(Dinero.pesos(pesos).porcentaje(bps).valor).toBe(esperado);
      },
    );

    it('el 0 % es cero y el 100 % es el mismo monto', () => {
      fc.assert(
        fc.property(monto, (a) => {
          expect(a.porcentaje(0).valor).toBe(0);
          expect(a.porcentaje(10_000).igualA(a)).toBe(true);
        }),
      );
    });

    it('propiedad: nunca supera el monto y se aleja menos de medio peso del valor exacto', () => {
      fc.assert(
        fc.property(monto, puntosBasicos, (a, bps) => {
          const resultado = a.porcentaje(bps).valor;
          const exacto = (a.valor * bps) / 10_000;
          expect(resultado).toBeLessThanOrEqual(a.valor);
          expect(Math.abs(resultado - exacto)).toBeLessThanOrEqual(0.5);
        }),
      );
    });

    it('no pierde precisión con montos grandes', () => {
      // 9 007 199 254 740 991 × 9 999 no cabe en un number; con BigInt el resultado es exacto.
      expect(
        Dinero.pesos(Number.MAX_SAFE_INTEGER).porcentaje(9_999).valor,
      ).toBe(
        Number(
          (BigInt(Number.MAX_SAFE_INTEGER) * 9_999n * 2n + 10_000n) / 20_000n,
        ),
      );
    });

    it.each([[-1], [10_001], [8.5], [Number.NaN]])(
      'rechaza %s puntos básicos',
      (bps) => {
        expect(() => Dinero.pesos(1_000).porcentaje(bps)).toThrow(
          expect.objectContaining({ codigo: 'dinero.porcentaje_invalido' }),
        );
      },
    );
  });

  it('se compara por valor y se muestra con la moneda', () => {
    expect(Dinero.pesos(500).igualA(Dinero.pesos(500))).toBe(true);
    expect(Dinero.pesos(500).igualA(Dinero.pesos(501))).toBe(false);
    expect(String(Dinero.pesos(21_600))).toBe('21600 COP');
  });
});
