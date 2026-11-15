import { TOTP, Secret } from 'otpauth';
import { GeneradorDeTotpOtpauth } from '../../../../src/identidad/infraestructura/salida/seguridad/generador-de-totp-otpauth.js';

describe('GeneradorDeTotpOtpauth', () => {
  const generador = new GeneradorDeTotpOtpauth();

  it('genera un secreto base32 distinto cada vez', () => {
    const a = generador.generarSecreto();
    const b = generador.generarSecreto();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+=*$/);
  });

  it('la URI de inscripción es un otpauth:// con Seniory y la cuenta', () => {
    const secreto = generador.generarSecreto();

    const uri = generador.uriDeInscripcion(secreto, 'admin@seniory.test');

    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(decodeURIComponent(uri)).toContain('Seniory');
    expect(decodeURIComponent(uri)).toContain('admin@seniory.test');
  });

  it('acepta el código que genera la app autenticadora en este instante', () => {
    const secreto = generador.generarSecreto();
    const ahora = new Date('2026-01-01T00:00:00.000Z');
    const codigo = TOTP.generate({
      secret: Secret.fromBase32(secreto),
      digits: 6,
      period: 30,
      timestamp: ahora.getTime(),
    });

    expect(generador.verificar(secreto, codigo, ahora)).toBe(true);
  });

  it('acepta el código de un paso antes o después (reloj desajustado)', () => {
    const secreto = generador.generarSecreto();
    const ahora = new Date('2026-01-01T00:00:00.000Z');
    const codigoDeHace30s = TOTP.generate({
      secret: Secret.fromBase32(secreto),
      digits: 6,
      period: 30,
      timestamp: ahora.getTime() - 30_000,
    });

    expect(generador.verificar(secreto, codigoDeHace30s, ahora)).toBe(true);
  });

  it('rechaza un código de hace dos pasos (fuera de la ventana)', () => {
    const secreto = generador.generarSecreto();
    const ahora = new Date('2026-01-01T00:00:00.000Z');
    const codigoViejo = TOTP.generate({
      secret: Secret.fromBase32(secreto),
      digits: 6,
      period: 30,
      timestamp: ahora.getTime() - 90_000,
    });

    expect(generador.verificar(secreto, codigoViejo, ahora)).toBe(false);
  });

  it('rechaza un código de otro secreto', () => {
    const secreto = generador.generarSecreto();
    const otroSecreto = generador.generarSecreto();
    const ahora = new Date('2026-01-01T00:00:00.000Z');
    const codigoDelOtro = TOTP.generate({
      secret: Secret.fromBase32(otroSecreto),
      digits: 6,
      period: 30,
      timestamp: ahora.getTime(),
    });

    expect(generador.verificar(secreto, codigoDelOtro, ahora)).toBe(false);
  });

  it('rechaza un texto que no es un código válido', () => {
    const secreto = generador.generarSecreto();

    expect(generador.verificar(secreto, 'abcdef', new Date())).toBe(false);
  });
});
