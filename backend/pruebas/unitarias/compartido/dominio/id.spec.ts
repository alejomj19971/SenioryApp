import {
  idDesdeTexto,
  type Id,
} from '../../../../src/compartido/dominio/id.js';

describe('idDesdeTexto', () => {
  it('acepta un UUID y lo normaliza a minúsculas', () => {
    const id: Id<'Servicio'> = idDesdeTexto<'Servicio'>(
      ' 0192F3A4-5B6C-7D8E-9F01-23456789ABCD ',
    );
    expect(id).toBe('0192f3a4-5b6c-7d8e-9f01-23456789abcd');
  });

  it('acepta UUID v4 (los generados por la base o por pruebas) y v7', () => {
    expect(() =>
      idDesdeTexto('1b4e28ba-2fa1-41d2-883f-0016d3cca427'),
    ).not.toThrow();
    expect(() =>
      idDesdeTexto('019a0b2c-3d4e-7f60-8a1b-2c3d4e5f6a7b'),
    ).not.toThrow();
  });

  it.each([
    '',
    '123',
    '0192f3a4-5b6c-7d8e-9f01-23456789abc', // le falta un carácter
    '0192f3a4-5b6c-7d8e-9f01-23456789abcz', // carácter no hexadecimal
    '0192f3a45b6c7d8e9f0123456789abcd', // sin guiones
    '00000000-0000-0000-0000-000000000000', // UUID nulo
    "1' or '1'='1",
  ])('rechaza "%s"', (texto) => {
    expect(() => idDesdeTexto(texto)).toThrow(
      expect.objectContaining({ codigo: 'id.invalido' }),
    );
  });
});
