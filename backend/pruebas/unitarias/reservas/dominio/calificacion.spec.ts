import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import {
  Calificacion,
  LARGO_MAXIMO_DEL_COMENTARIO,
} from '../../../../src/reservas/dominio/calificacion.js';
import type { ServicioId } from '../../../../src/reservas/dominio/ids.js';
import { AHORA_RESERVAS, FAMILIAR_ID } from '../../../soporte/reservas.js';

const SERVICIO_ID = '0198aaaa-0000-7000-8000-0000000000e1' as ServicioId;

const crear = (calificacion: number, comentario: string | null = null) =>
  Calificacion.crear({
    servicioId: SERVICIO_ID,
    familiarId: FAMILIAR_ID,
    calificacion,
    comentario,
    creadaEn: AHORA_RESERVAS,
  });

describe('Calificacion', () => {
  it.each([1, 2, 3, 4, 5])('acepta un %s', (valor) => {
    expect(crear(valor).calificacion).toBe(valor);
  });

  it.each([0, 6, -1, 3.5, Number.NaN])('rechaza un %s', (valor) => {
    expect(() => crear(valor)).toThrow(
      expect.objectContaining({
        constructor: ErrorDeValidacion,
        codigo: 'calificacion.valor_invalido',
      }) as Error,
    );
  });

  it('el comentario es opcional: sin él o vacío queda en null', () => {
    expect(crear(5).comentario).toBeNull();
    expect(crear(5, '').comentario).toBeNull();
    expect(crear(5, '   \n ').comentario).toBeNull();
  });

  it('recorta y normaliza el comentario', () => {
    expect(crear(4, '  Muy atenta  ').comentario).toBe('Muy atenta');
    expect(crear(4, 'José').comentario).toBe('José');
  });

  it(`acepta hasta ${LARGO_MAXIMO_DEL_COMENTARIO} caracteres y rechaza uno más`, () => {
    expect(() =>
      crear(5, 'a'.repeat(LARGO_MAXIMO_DEL_COMENTARIO)),
    ).not.toThrow();
    expect(() => crear(5, 'a'.repeat(LARGO_MAXIMO_DEL_COMENTARIO + 1))).toThrow(
      expect.objectContaining({
        codigo: 'calificacion.comentario_muy_largo',
      }) as Error,
    );
  });

  it('cuenta caracteres, no bytes: 500 emojis caben', () => {
    expect(() =>
      crear(5, '👍'.repeat(LARGO_MAXIMO_DEL_COMENTARIO)),
    ).not.toThrow();
  });

  it('guarda a qué servicio y quién', () => {
    const c = crear(5);

    expect(c.servicioId).toBe(SERVICIO_ID);
    expect(c.familiarId).toBe(FAMILIAR_ID);
    expect(c.creadaEn).toEqual(AHORA_RESERVAS);
  });
});
