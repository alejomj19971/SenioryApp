import type { NestExpressApplication } from '@nestjs/platform-express';
import { Secret, TOTP } from 'otpauth';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { CrearAdministrador } from '../../src/identidad/aplicacion/casos-de-uso/crear-administrador.js';
import { ENVIADOR_DE_RECUPERACION } from '../../src/identidad/aplicacion/puertos/salida/enviador-de-recuperacion.js';
import { EnviadorDeRecuperacionEnMemoria } from '../soporte/enviador-de-recuperacion.js';
import {
  CONTRASENA,
  como,
  conSesion,
  correoNuevo,
  nuevaIp,
  registrarFamiliar,
  sesionDe,
  SECRETO_BFF,
  type Cliente,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';

// El segundo factor (TOTP) de los administradores (decisión 4 de M1). El reloj es falso: los códigos
// TOTP dependen de la hora, y hace falta avanzarla a propósito para probar la ventana y el vencimiento.

const INICIO = '2035-03-01T12:00:00.000Z';
const MINUTO = 60_000;
const reloj = new RelojFalso(INICIO);
const enviador = new EnviadorDeRecuperacionEnMemoria();
const bd = conectarBd();

function codigoPara(secretoBase32: string, cuando = reloj.ahora()): string {
  return TOTP.generate({
    secret: Secret.fromBase32(secretoBase32),
    digits: 6,
    period: 30,
    timestamp: cuando.getTime(),
  });
}

describe('segundo factor de administradores (API)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: { SECRETO_BFF, ORIGENES_PERMITIDOS: 'http://localhost:3000' },
      ajustar: (constructor) =>
        constructor
          .overrideProvider(RELOJ)
          .useValue(reloj)
          .overrideProvider(ENVIADOR_DE_RECUPERACION)
          .useValue(enviador),
    });
  });

  beforeEach(() => {
    reloj.fijar(INICIO);
    enviador.disponible = true;
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  const cliente = () => como(app, nuevaIp());

  async function crearAdmin(c: Cliente) {
    const correo = correoNuevo();
    await app.get(CrearAdministrador, { strict: false }).ejecutar({
      nombre: 'Laura Administradora',
      correo,
      contrasena: CONTRASENA,
    });
    const login = await c
      .post('/api/v1/auth/login')
      .send({ correo, contrasena: CONTRASENA });
    expect(login.status).toBe(200);
    return { correo, cookie: conSesion(sesionDe(login)) };
  }

  const estado = (c: Cliente, cookie: string) =>
    c.get('/api/v1/cuentas/yo/segundo-factor').set('Cookie', cookie).send();

  const iniciar = (c: Cliente, cookie: string) =>
    c.post('/api/v1/cuentas/yo/segundo-factor').set('Cookie', cookie).send();

  const confirmar = (c: Cliente, cookie: string, codigo: string) =>
    c
      .post('/api/v1/cuentas/yo/segundo-factor/confirmacion')
      .set('Cookie', cookie)
      .send({ codigo });

  const desactivar = (c: Cliente, cookie: string) =>
    c.delete('/api/v1/cuentas/yo/segundo-factor').set('Cookie', cookie).send();

  const entrar = (c: Cliente, correo: string, contrasena = CONTRASENA) =>
    c.post('/api/v1/auth/login').send({ correo, contrasena });

  const verificar = (c: Cliente, desafio: string, codigo: string) =>
    c.post('/api/v1/auth/login/segundo-factor').send({ desafio, codigo });

  // Activa el segundo factor de principio a fin y devuelve el secreto en base32.
  async function activar(c: Cliente, cookie: string): Promise<string> {
    const configuracion = await iniciar(c, cookie);
    expect(configuracion.status).toBe(200);
    const { secretoManual } = configuracion.body as {
      secretoManual: string;
    };
    const respuesta = await confirmar(
      c,
      cookie,
      codigoPara(secretoManual),
    );
    expect(respuesta.status).toBe(204);
    return secretoManual;
  }

  describe('un administrador sin segundo factor', () => {
    it('entra directo, con sesión de una vez', async () => {
      const c = cliente();
      const { correo } = await crearAdmin(c);

      const login = await entrar(c, correo);

      expect(login.status).toBe(200);
      expect(login.body).toMatchObject({ usuario: { rol: 'administrador' } });
      expect(sesionDe(login)).toBeDefined();
    });
  });

  describe('consultar el estado', () => {
    it('dice si está activo, antes y después de confirmarlo', async () => {
      const c = cliente();
      const { cookie } = await crearAdmin(c);

      expect((await estado(c, cookie)).body).toEqual({ activo: false });

      await activar(c, cookie);

      expect((await estado(c, cookie)).body).toEqual({ activo: true });
    });
  });

  describe('configurar el segundo factor', () => {
    it('solo lo pueden usar administradores', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      expect(
        (await iniciar(c, conSesion(persona.sesion))).status,
      ).toBe(403);
    });

    it('la URI de inscripción trae Seniory y el correo de la cuenta', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);

      const respuesta = await iniciar(c, cookie);

      expect(respuesta.status).toBe(200);
      const { uriDeInscripcion } = respuesta.body as {
        uriDeInscripcion: string;
      };
      expect(decodeURIComponent(uriDeInscripcion)).toContain('Seniory');
      expect(decodeURIComponent(uriDeInscripcion)).toContain(correo);
    });

    it('un código incorrecto no confirma, y el login sigue sin exigirlo', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);
      await iniciar(c, cookie);

      const respuesta = await confirmar(c, cookie, '000000');

      expect(respuesta.status).toBe(400);
      expect((await entrar(c, correo)).status).toBe(200);
    });

    it('un código correcto confirma: desde ahí el login lo exige', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);

      await activar(c, cookie);

      const login = await entrar(c, correo);
      expect(login.status).toBe(200);
      expect(login.body).toMatchObject({ requiereSegundoFactor: true });
      expect(() => sesionDe(login)).toThrow();
    });
  });

  describe('el segundo paso del login', () => {
    it('con el código correcto, da la sesión de verdad', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);
      const secreto = await activar(c, cookie);

      const login = await entrar(c, correo);
      const { desafio } = login.body as { desafio: string };
      reloj.avanzar(1000);
      const verificacion = await verificar(c, desafio, codigoPara(secreto, reloj.ahora()));

      expect(verificacion.status).toBe(200);
      expect(verificacion.body).toMatchObject({
        usuario: { rol: 'administrador' },
      });
      expect(sesionDe(verificacion)).toBeDefined();
    });

    it('con un código incorrecto, no da sesión', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);
      await activar(c, cookie);

      const login = await entrar(c, correo);
      const { desafio } = login.body as { desafio: string };
      const verificacion = await verificar(c, desafio, '000000');

      expect(verificacion.status).toBe(401);
      expect(() => sesionDe(verificacion)).toThrow();
    });

    it('el mismo desafío no sirve dos veces', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);
      const secreto = await activar(c, cookie);

      const login = await entrar(c, correo);
      const { desafio } = login.body as { desafio: string };
      const codigo = codigoPara(secreto);
      expect((await verificar(c, desafio, codigo)).status).toBe(200);
      expect((await verificar(c, desafio, codigo)).status).toBe(401);
    });

    it('vence a los 5 minutos', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);
      const secreto = await activar(c, cookie);

      const login = await entrar(c, correo);
      const { desafio } = login.body as { desafio: string };
      reloj.avanzar(5 * MINUTO);

      const verificacion = await verificar(c, desafio, codigoPara(secreto, reloj.ahora()));

      expect(verificacion.status).toBe(401);
    });

    it('un desafío inventado no sirve', async () => {
      const c = cliente();

      const respuesta = await verificar(c, 'x'.repeat(43), '123456');

      expect(respuesta.status).toBe(401);
    });
  });

  describe('desactivar el segundo factor', () => {
    it('por su cuenta: el login deja de exigirlo', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);
      await activar(c, cookie);

      expect((await desactivar(c, cookie)).status).toBe(204);

      const login = await entrar(c, correo);
      expect(login.status).toBe(200);
      expect(sesionDe(login)).toBeDefined();
    });
  });

  // El respaldo para cuando se pierde el celular: demostrar que controla su correo (el flujo de «olvidé
  // mi contraseña» de siempre) también apaga el segundo factor.
  describe('recuperar el acceso por correo (perdió el celular)', () => {
    async function pedirEnlace(correo: string): Promise<string> {
      const antes = enviador.paraCorreo(correo).length;
      const respuesta = await cliente()
        .post('/api/v1/auth/olvide-contrasena')
        .send({ correo });
      expect(respuesta.status).toBe(202);
      const mensajes = enviador.paraCorreo(correo);
      expect(mensajes).toHaveLength(antes + 1);
      return EnviadorDeRecuperacionEnMemoria.tokenDe(mensajes[antes] as never);
    }

    it('restablecer la contraseña apaga el segundo factor, y lo dice en la respuesta', async () => {
      const c = cliente();
      const { correo, cookie } = await crearAdmin(c);
      await activar(c, cookie);

      const token = await pedirEnlace(correo);
      const restablecer = await c
        .post('/api/v1/auth/restablecer-contrasena')
        .send({ token, contrasenaNueva: 'una contraseña nueva y segura' });

      expect(restablecer.status).toBe(200);
      expect(restablecer.body).toEqual({ segundoFactorDesactivado: true });

      const login = await entrar(c, correo, 'una contraseña nueva y segura');
      expect(login.status).toBe(200);
      expect(sesionDe(login)).toBeDefined();
    });

    it('sin segundo factor activo, la respuesta dice que no había nada que apagar', async () => {
      const c = cliente();
      const { correo } = await crearAdmin(c);

      const token = await pedirEnlace(correo);
      const restablecer = await c
        .post('/api/v1/auth/restablecer-contrasena')
        .send({ token, contrasenaNueva: 'una contraseña nueva y segura' });

      expect(restablecer.body).toEqual({ segundoFactorDesactivado: false });
    });
  });
});
