import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import {
  codificarCursor,
  decodificarCursor,
  LIMITE_MAXIMO,
  LIMITE_POR_DEFECTO,
  limiteDe,
} from '../../../../src/reservas/dominio/cursor-de-servicios.js';

const ID = '0198aaaa-0000-7000-8000-000000000001';
const FECHA = new Date('2026-10-21T15:00:00.123Z');

const invalido = (texto: string) => () => decodificarCursor(texto);
const comoCursor = (valor: unknown) =>
  Buffer.from(JSON.stringify(valor), 'utf8').toString('base64url');

describe('cursor de servicios', () => {
  it('ida y vuelta, con los milisegundos intactos', () => {
    const cursor = { creadoEn: FECHA, id: ID };

    expect(decodificarCursor(codificarCursor(cursor))).toEqual(cursor);
  });

  it('es texto seguro para una URL', () => {
    expect(codificarCursor({ creadoEn: FECHA, id: ID })).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });

  it.each([
    ['vacío', ''],
    ['basura', 'esto-no-es-un-cursor'],
    ['JSON que no es un objeto', comoCursor(5)],
    ['null', comoCursor(null)],
    ['sin id', comoCursor({ creadoEn: FECHA.toISOString() })],
    ['sin fecha', comoCursor({ id: ID })],
    [
      'id que no es un UUID',
      comoCursor({ creadoEn: FECHA.toISOString(), id: 'x' }),
    ],
    [
      'id con una inyección',
      comoCursor({
        creadoEn: FECHA.toISOString(),
        id: `${ID.slice(0, 35)}'`,
      }),
    ],
    ['fecha inválida', comoCursor({ creadoEn: 'ayer', id: ID })],
    ['fecha con otro formato', comoCursor({ creadoEn: '2026-10-21', id: ID })],
    ['fecha numérica', comoCursor({ creadoEn: 1_700_000_000_000, id: ID })],
  ])('rechaza un cursor %s', (_nombre, texto) => {
    expect(invalido(texto)).toThrow(
      expect.objectContaining({
        constructor: ErrorDeValidacion,
        codigo: 'paginacion.cursor_invalido',
      }) as Error,
    );
  });
});

describe('limiteDe', () => {
  it('sin límite, usa el de por defecto', () => {
    expect(limiteDe(undefined)).toBe(LIMITE_POR_DEFECTO);
    expect(LIMITE_POR_DEFECTO).toBe(20);
  });

  it.each([1, 20, LIMITE_MAXIMO])('acepta %s', (limite) => {
    expect(limiteDe(limite)).toBe(limite);
  });

  it.each([0, -1, LIMITE_MAXIMO + 1, 1.5, Number.NaN])(
    'rechaza %s',
    (limite) => {
      expect(() => limiteDe(limite)).toThrow(
        expect.objectContaining({
          codigo: 'paginacion.limite_invalido',
        }) as Error,
      );
    },
  );

  it('el máximo es 50', () => {
    expect(LIMITE_MAXIMO).toBe(50);
  });
});
