import { CifradorDeSecretosAes } from '../../../../src/identidad/infraestructura/salida/seguridad/cifrador-de-secretos-aes.js';

describe('CifradorDeSecretosAes', () => {
  it('descifra lo mismo que cifró', () => {
    const cifrador = new CifradorDeSecretosAes('secreto-de-cifrado-de-prueba-0123456789');

    const cifrado = cifrador.cifrar('un secreto TOTP en base32');

    expect(cifrador.descifrar(cifrado)).toBe('un secreto TOTP en base32');
  });

  it('cifra el mismo texto de forma distinta cada vez (el vector de inicio es al azar)', () => {
    const cifrador = new CifradorDeSecretosAes('secreto-de-cifrado-de-prueba-0123456789');

    const a = cifrador.cifrar('mismo texto');
    const b = cifrador.cifrar('mismo texto');

    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(cifrador.descifrar(a)).toBe('mismo texto');
    expect(cifrador.descifrar(b)).toBe('mismo texto');
  });

  it('no descifra con una llave distinta', () => {
    const cifrado = new CifradorDeSecretosAes('llave-uno-de-prueba-0123456789abcdef').cifrar('secreto');
    const otroCifrador = new CifradorDeSecretosAes('llave-dos-de-prueba-0123456789abcdef');

    expect(() => otroCifrador.descifrar(cifrado)).toThrow();
  });

  it('no descifra un dato manipulado', () => {
    const cifrador = new CifradorDeSecretosAes('secreto-de-cifrado-de-prueba-0123456789');
    const cifrado = Buffer.from(cifrador.cifrar('secreto'));
    cifrado[cifrado.length - 1] = (cifrado[cifrado.length - 1]! + 1) % 256;

    expect(() => cifrador.descifrar(cifrado)).toThrow();
  });

  it('rechaza un dato demasiado corto para ser válido', () => {
    const cifrador = new CifradorDeSecretosAes('secreto-de-cifrado-de-prueba-0123456789');

    expect(() => cifrador.descifrar(new Uint8Array(10))).toThrow(
      'formato válido',
    );
  });
});
