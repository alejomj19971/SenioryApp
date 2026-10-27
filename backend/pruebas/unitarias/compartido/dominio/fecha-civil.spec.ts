import fc from 'fast-check';
import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import { RelojFalso } from '../../../soporte/dobles.js';

const BOGOTA = 'America/Bogota';
const fecha = (texto: string) => FechaCivil.desdeTexto(texto);

describe('FechaCivil', () => {
  describe('desdeTexto', () => {
    it.each([
      '2026-10-21',
      '2024-02-29',
      '2000-02-29',
      '0001-01-01',
      '9999-12-31',
    ])('acepta %s', (texto) => {
      expect(fecha(texto).aTexto()).toBe(texto);
    });

    it.each([
      ['2026-02-30', 'fecha.inexistente'],
      ['2025-02-29', 'fecha.inexistente'], // 2025 no es bisiesto
      ['1900-02-29', 'fecha.inexistente'], // divisible por 100 y no por 400
      ['2026-13-01', 'fecha.inexistente'],
      ['2026-00-10', 'fecha.inexistente'],
      ['2026-04-31', 'fecha.inexistente'],
      ['0000-01-01', 'fecha.inexistente'],
      ['2026-1-5', 'fecha.formato_invalido'],
      ['21/10/2026', 'fecha.formato_invalido'],
      ['2026-10-21T00:00:00Z', 'fecha.formato_invalido'],
      [' 2026-10-21', 'fecha.formato_invalido'],
      ['', 'fecha.formato_invalido'],
    ])('rechaza "%s"', (texto, codigo) => {
      expect(() => fecha(texto)).toThrow(ErrorDeValidacion);
      expect(() => fecha(texto)).toThrow(expect.objectContaining({ codigo }));
    });
  });

  describe('hoy (hallazgo H2: el día depende de la zona horaria)', () => {
    it('a las 8 p. m. del 21 de octubre en Bogotá (01:00 UTC del 22) sigue siendo 21', () => {
      const reloj = new RelojFalso('2026-10-22T01:00:00.000Z');
      expect(FechaCivil.hoy(reloj, BOGOTA).aTexto()).toBe('2026-10-21');
      expect(FechaCivil.hoy(reloj, 'UTC').aTexto()).toBe('2026-10-22');
    });

    it('cambia de día a la medianoche de Bogotá (05:00 UTC)', () => {
      const reloj = new RelojFalso('2026-10-22T04:59:59.999Z');
      expect(FechaCivil.hoy(reloj, BOGOTA).aTexto()).toBe('2026-10-21');
      reloj.avanzar(1);
      expect(FechaCivil.hoy(reloj, BOGOTA).aTexto()).toBe('2026-10-22');
    });

    it('cruza el año nuevo según la zona', () => {
      const reloj = new RelojFalso('2027-01-01T03:00:00.000Z');
      expect(FechaCivil.hoy(reloj, BOGOTA).aTexto()).toBe('2026-12-31');
    });
  });

  describe('sumarDias', () => {
    it.each([
      ['2026-10-21', 1, '2026-10-22'],
      ['2026-10-31', 1, '2026-11-01'],
      ['2026-12-31', 1, '2027-01-01'],
      ['2024-02-28', 1, '2024-02-29'],
      ['2025-02-28', 1, '2025-03-01'],
      ['2026-03-01', -1, '2026-02-28'],
      ['2026-10-21', 0, '2026-10-21'],
      ['2026-10-21', 365, '2027-10-21'],
      ['2026-01-15', -30, '2025-12-16'],
    ])('%s + %i días = %s', (inicio, dias, esperado) => {
      expect(fecha(inicio).sumarDias(dias).aTexto()).toBe(esperado);
    });

    it('rechaza días no enteros y resultados fuera del rango de años', () => {
      expect(() => fecha('2026-10-21').sumarDias(1.5)).toThrow(
        expect.objectContaining({ codigo: 'fecha.dias_invalidos' }),
      );
      expect(() => fecha('9999-12-31').sumarDias(1)).toThrow(
        expect.objectContaining({ codigo: 'fecha.fuera_de_rango' }),
      );
      expect(() => fecha('0001-01-01').sumarDias(-1)).toThrow(
        expect.objectContaining({ codigo: 'fecha.fuera_de_rango' }),
      );
    });

    it('propiedad: sumar n días y luego restarlos devuelve la misma fecha', () => {
      fc.assert(
        fc.property(
          fc.date({
            min: new Date('1900-01-01T00:00:00Z'),
            max: new Date('2200-12-31T00:00:00Z'),
            noInvalidDate: true,
          }),
          fc.integer({ min: -20_000, max: 20_000 }),
          (instante, dias) => {
            const inicial = fecha(instante.toISOString().slice(0, 10));
            const ida = inicial.sumarDias(dias);
            expect(ida.sumarDias(-dias).igualA(inicial)).toBe(true);
            if (dias > 0) expect(inicial.esAnteriorA(ida)).toBe(true);
          },
        ),
      );
    });
  });

  describe('comparación', () => {
    it('ordena por día', () => {
      expect(fecha('2026-10-21').esAnteriorA(fecha('2026-10-22'))).toBe(true);
      expect(fecha('2026-10-22').esAnteriorA(fecha('2026-10-21'))).toBe(false);
      expect(fecha('2026-10-21').esAnteriorA(fecha('2026-10-21'))).toBe(false);
      expect(fecha('2025-12-31').esAnteriorA(fecha('2026-01-01'))).toBe(true);
    });

    it('dos fechas del mismo día son iguales', () => {
      expect(fecha('2026-10-21').igualA(fecha('2026-10-21'))).toBe(true);
      expect(fecha('2026-10-21').igualA(fecha('2026-10-20'))).toBe(false);
    });

    it('distingue los años 0 a 99 de 1900 a 1999', () => {
      expect(fecha('0050-01-01').esAnteriorA(fecha('1950-01-01'))).toBe(true);
      expect(fecha('0099-12-31').sumarDias(1).aTexto()).toBe('0100-01-01');
    });
  });

  it('se muestra como AAAA-MM-DD', () => {
    expect(String(fecha('2026-01-05'))).toBe('2026-01-05');
  });
});
