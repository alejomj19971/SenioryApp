import { createHash } from 'node:crypto';
import { GeneradorDeTokensOpacosAleatorio } from '../../../../src/identidad/infraestructura/salida/seguridad/generador-de-tokens-opacos-aleatorio.js';

describe('GeneradorDeTokensOpacosAleatorio', () => {
  const generador = new GeneradorDeTokensOpacosAleatorio();

  it('genera 256 bits en base64url (43 caracteres, sin relleno ni símbolos de URL)', () => {
    const { token } = generador.generar();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('nunca repite un token', () => {
    const tokens = new Set(
      Array.from({ length: 1_000 }, () => generador.generar().token),
    );

    expect(tokens.size).toBe(1_000);
  });

  it('el hash es el SHA-256 del token, de 32 bytes', () => {
    const { token, hash } = generador.generar();

    expect(hash).toHaveLength(32);
    expect(
      Buffer.from(hash).equals(createHash('sha256').update(token).digest()),
    ).toBe(true);
  });

  it('hashDe da el mismo hash que se calculó al generar', () => {
    const { token, hash } = generador.generar();

    expect(Buffer.from(generador.hashDe(token)).equals(Buffer.from(hash))).toBe(
      true,
    );
  });

  it('el hash no contiene el token', () => {
    const { token, hash } = generador.generar();

    expect(Buffer.from(hash).toString('base64url')).not.toBe(token);
  });
});
