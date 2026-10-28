import { Contrasena } from '../../../../src/identidad/dominio/contrasena.js';
import { HashDeContrasenasArgon2 } from '../../../../src/identidad/infraestructura/salida/seguridad/hash-de-contrasenas-argon2.js';

const sinComunes = { contiene: () => false };
const contrasena = (texto: string) => Contrasena.crear(texto, sinComunes);

describe('HashDeContrasenasArgon2', () => {
  const hasher = new HashDeContrasenasArgon2();

  it('calcula argon2id con los parámetros de OWASP (19 MiB, 2 iteraciones, 1 hilo)', async () => {
    const hash = await hasher.calcular(contrasena('una contraseña larga'));

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('no incluye la contraseña en el hash', async () => {
    const hash = await hasher.calcular(contrasena('una contraseña larga'));

    expect(hash).not.toContain('una contraseña larga');
  });

  it('usa una sal distinta cada vez: dos hashes de la misma contraseña difieren', async () => {
    const [a, b] = await Promise.all([
      hasher.calcular(contrasena('una contraseña larga')),
      hasher.calcular(contrasena('una contraseña larga')),
    ]);

    expect(a).not.toBe(b);
  });

  it('verifica la contraseña correcta y rechaza una incorrecta', async () => {
    const hash = await hasher.calcular(contrasena('una contraseña larga'));

    expect(
      await hasher.verificar(
        hash,
        Contrasena.paraVerificar('una contraseña larga'),
      ),
    ).toBe(true);
    expect(
      await hasher.verificar(hash, Contrasena.paraVerificar('otra contraseña')),
    ).toBe(false);
  });

  it('la misma contraseña escrita con otra composición de Unicode entra igual (NFKC)', async () => {
    // «é» compuesta al crear; «e» + acento suelto al entrar.
    const hash = await hasher.calcular(contrasena('contraseña-secreta-é'));

    expect(
      await hasher.verificar(
        hash,
        Contrasena.paraVerificar('contraseña-secreta-é'),
      ),
    ).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['texto cualquiera', 'esto-no-es-un-hash'],
    ['PHC truncado', '$argon2id$v=19$m=19456'],
  ])(
    'un hash guardado ilegible (%s) no coincide y no lanza',
    async (_caso, hash) => {
      expect(await hasher.verificar(hash, Contrasena.paraVerificar('x'))).toBe(
        false,
      );
    },
  );

  it('simular la verificación tarda lo mismo que verificar de verdad', async () => {
    const hash = await hasher.calcular(contrasena('una contraseña larga'));
    const intento = Contrasena.paraVerificar('otra contraseña');
    await hasher.simularVerificacion(intento); // la primera calcula el hash ficticio

    const medir = async (accion: () => Promise<unknown>) => {
      const inicio = performance.now();
      await accion();
      return performance.now() - inicio;
    };
    const real = await medir(() => hasher.verificar(hash, intento));
    const simulada = await medir(() => hasher.simularVerificacion(intento));

    // Misma magnitud: ninguna es una fracción de la otra (margen amplio para no depender de la máquina).
    expect(simulada).toBeGreaterThan(real / 4);
    expect(simulada).toBeLessThan(real * 4);
  });
});
