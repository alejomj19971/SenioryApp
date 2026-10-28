import {
  esViolacionDeUnicidad,
  violacionDeRestriccion,
} from '../../../../src/compartido/infraestructura/base-de-datos/errores-de-postgres.js';

// Como el error de `pg`: un Error con `code` y `constraint`.
function errorDePg(code: string, constraint?: string): Error {
  return Object.assign(new Error('error de postgres'), { code, constraint });
}

// Como lo entrega Drizzle: envuelto, con el original en `cause`.
function envuelto(causa: unknown): Error {
  return new Error('Failed query: insert into ...', { cause: causa });
}

describe('violacionDeRestriccion', () => {
  it.each([
    ['23505', 'unica'],
    ['23503', 'foranea'],
    ['23514', 'check'],
    ['23502', 'no_nula'],
  ])('reconoce el código %s como %s', (code, tipo) => {
    expect(violacionDeRestriccion(errorDePg(code, 'una_restriccion'))).toEqual({
      tipo,
      restriccion: 'una_restriccion',
    });
  });

  it('encuentra el error original dentro del que envuelve Drizzle', () => {
    const error = envuelto(errorDePg('23505', 'usuarios_correo_unico'));

    expect(violacionDeRestriccion(error)).toEqual({
      tipo: 'unica',
      restriccion: 'usuarios_correo_unico',
    });
  });

  it('sigue la cadena de causas a través de varias capas', () => {
    const error = envuelto(envuelto(errorDePg('23505', 'x_unico')));

    expect(violacionDeRestriccion(error)?.restriccion).toBe('x_unico');
  });

  it('la restricción puede faltar', () => {
    expect(violacionDeRestriccion(errorDePg('23505'))).toEqual({
      tipo: 'unica',
      restriccion: undefined,
    });
  });

  it.each([
    ['otro código de Postgres', errorDePg('42601')],
    ['un error corriente', new Error('algo falló')],
    ['un error con causa sin código', envuelto(new Error('otra cosa'))],
    ['un valor que no es un error', 'texto'],
    ['null', null],
    ['undefined', undefined],
  ])('no reconoce %s', (_caso, error) => {
    expect(violacionDeRestriccion(error)).toBeNull();
  });

  it('no se queda en un ciclo de causas', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;

    expect(violacionDeRestriccion(a)).toBeNull();
  });
});

describe('esViolacionDeUnicidad', () => {
  it('es verdadero solo para esa restricción', () => {
    const error = envuelto(errorDePg('23505', 'usuarios_correo_unico'));

    expect(esViolacionDeUnicidad(error, 'usuarios_correo_unico')).toBe(true);
    expect(esViolacionDeUnicidad(error, 'otra_restriccion')).toBe(false);
  });

  it('una violación de otro tipo, aunque tenga ese nombre, no cuenta', () => {
    const error = envuelto(errorDePg('23514', 'usuarios_correo_unico'));

    expect(esViolacionDeUnicidad(error, 'usuarios_correo_unico')).toBe(false);
  });
});
