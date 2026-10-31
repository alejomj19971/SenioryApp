import { createHash } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { ENVIADOR_DE_RECUPERACION } from '../../src/identidad/aplicacion/puertos/salida/enviador-de-recuperacion.js';
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
  type Persona,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import { EnviadorDeRecuperacionEnMemoria } from '../soporte/enviador-de-recuperacion.js';
import { ControladorDePrueba } from './controlador-de-prueba.js';

// Recuperar y cambiar la contraseña (M1 §4.2). El reloj es falso y está en 2035 para avanzar el tiempo.

const INICIO = '2035-03-01T12:00:00.000Z';
const MINUTO = 60_000;
const NUEVA = 'otra contraseña larga y distinta';
const reloj = new RelojFalso(INICIO);
const enviador = new EnviadorDeRecuperacionEnMemoria();
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

const sha256 = (texto: string) => createHash('sha256').update(texto).digest();

describe('recuperación y cambio de contraseña (API)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      controladores: [ControladorDePrueba],
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
    enviador.falla = false;
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────
  const cliente = () => como(app, nuevaIp());

  const olvide = (c: Cliente, correo: string) =>
    c.post('/api/v1/auth/olvide-contrasena').send({ correo });

  const restablecer = (c: Cliente, token: string, contrasenaNueva = NUEVA) =>
    c
      .post('/api/v1/auth/restablecer-contrasena')
      .send({ token, contrasenaNueva });

  const entrar = (c: Cliente, correo: string, contrasena: string) =>
    c.post('/api/v1/auth/login').send({ correo, contrasena });

  // Pide el enlace y devuelve su token, tal como lo vería la persona en su correo.
  async function pedirEnlace(c: Cliente, correo: string): Promise<string> {
    const antes = enviador.paraCorreo(correo).length;
    const respuesta = await olvide(c, correo);
    expect(respuesta.status).toBe(202);
    const mensajes = enviador.paraCorreo(correo);
    expect(mensajes).toHaveLength(antes + 1);
    return EnviadorDeRecuperacionEnMemoria.tokenDe(mensajes[antes] as never);
  }

  const sesionesVigentes = async (usuarioId: string) =>
    (
      await filas<{ n: string }>(
        'select count(*) as n from identidad.sesiones_refresco where usuario_id = $1 and revocada_en is null',
        [usuarioId],
      )
    )[0]?.n;

  const auditoria = (accion: string, usuarioId: string | null) =>
    filas<{ resultado: string; metadatos: unknown }>(
      `select resultado, metadatos from compartido.auditoria
       where accion = $1 and actor_id is not distinct from $2::uuid order by ocurrido_en, id`,
      [accion, usuarioId],
    );

  const sinCorrelacion = (cuerpo: unknown) => {
    const { idDeCorrelacion: _id, ...resto } = cuerpo as Record<
      string,
      unknown
    >;
    return resto;
  };

  // ─── POST /auth/olvide-contrasena ──────────────────────────────────────────────────────────
  describe('POST /auth/olvide-contrasena', () => {
    it('envía a la cuenta un enlace al frontend con un token de 256 bits que vence en 30 minutos', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const respuesta = await olvide(c, persona.correo);

      expect(respuesta.status).toBe(202);
      expect(respuesta.text).toBe('');
      const [mensaje] = enviador.paraCorreo(persona.correo);
      expect(mensaje).toMatchObject({
        nombre: 'Andrea Gómez',
        correo: persona.correo,
        expiraEn: new Date(Date.parse(INICIO) + 30 * MINUTO),
      });
      expect(mensaje?.enlace).toMatch(
        /^http:\/\/localhost:3000\/restablecer-contrasena\?token=[A-Za-z0-9_-]{43}$/,
      );
    });

    it('en la base solo queda el SHA-256 del token, nunca el token', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const token = await pedirEnlace(c, persona.correo);

      const guardados = await filas<{ hash_del_token: Buffer }>(
        'select hash_del_token from identidad.tokens_de_recuperacion where usuario_id = $1',
        [persona.id],
      );
      expect(guardados).toHaveLength(1);
      expect(guardados[0]?.hash_del_token.equals(sha256(token))).toBe(true);
    });

    it('responde IGUAL con una cuenta que existe, una que no y un correo mal escrito', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const existe = await olvide(c, persona.correo);
      const noExiste = await olvide(c, correoNuevo());
      const malEscrito = await olvide(c, 'esto no es un correo');

      for (const r of [noExiste, malEscrito]) {
        expect(r.status).toBe(existe.status);
        expect(r.text).toBe(existe.text);
      }
      expect(enviador.mensajes.map((m) => m.correo)).not.toContain(
        'esto no es un correo',
      );
    });

    it('con un correo sin cuenta no se envía nada ni se guarda ningún enlace', async () => {
      const c = cliente();
      const desconocido = correoNuevo();
      const antes = enviador.mensajes.length;

      await olvide(c, desconocido);

      expect(enviador.mensajes).toHaveLength(antes);
      expect(
        await auditoria('identidad.solicitar_recuperacion', null),
      ).toContainEqual({
        resultado: 'denegado',
        metadatos: { motivo: 'cuenta_desconocida' },
      });
    });

    it('una cuenta eliminada no recibe enlace', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await bd.query(
        "update identidad.usuarios set estado = 'eliminado' where id = $1",
        [persona.id],
      );

      const respuesta = await olvide(c, persona.correo);

      expect(respuesta.status).toBe(202);
      expect(enviador.paraCorreo(persona.correo)).toHaveLength(0);
    });

    it('el correo se reconoce con otras mayúsculas', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      await olvide(c, persona.correo.toUpperCase());

      expect(enviador.paraCorreo(persona.correo)).toHaveLength(1);
    });

    it('no manda otro correo dentro del minuto siguiente (no se puede usar para llenar un buzón)', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await olvide(c, persona.correo);

      reloj.avanzar(30_000);
      const segunda = await olvide(c, persona.correo);

      expect(segunda.status).toBe(202); // igual que siempre: no se avisa que se ignoró
      expect(enviador.paraCorreo(persona.correo)).toHaveLength(1);
      expect(
        await auditoria('identidad.solicitar_recuperacion', persona.id),
      ).toContainEqual({
        resultado: 'denegado',
        metadatos: { motivo: 'demasiado_pronto' },
      });
    });

    it('pasado el minuto envía otro y SOLO sirve el último enlace', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const primero = await pedirEnlace(c, persona.correo);
      reloj.avanzar(61_000);
      const segundo = await pedirEnlace(c, persona.correo);

      expect((await restablecer(c, primero)).status).toBe(400);
      expect((await restablecer(c, segundo)).status).toBe(204);
    });

    it('dos peticiones simultáneas para la misma cuenta mandan UN solo correo', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      await Promise.all([olvide(c, persona.correo), olvide(c, persona.correo)]);

      expect(enviador.paraCorreo(persona.correo)).toHaveLength(1);
    });

    it('si el canal falla, igual responde 202 y deja constancia del error en la auditoría', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      enviador.falla = true;

      const respuesta = await olvide(c, persona.correo);
      await vi.waitFor(async () => {
        expect(
          await auditoria('identidad.solicitar_recuperacion', persona.id),
        ).toContainEqual({
          resultado: 'error',
          metadatos: { motivo: 'envio_fallido' },
        });
      });

      expect(respuesta.status).toBe(202);
    });

    it('sin canal para enviar responde 503 para TODAS las cuentas, y no promete nada', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      enviador.disponible = false;

      const existe = await olvide(c, persona.correo);
      const noExiste = await olvide(c, correoNuevo());

      expect(existe.status).toBe(503);
      expect(existe.body).toMatchObject({
        codigo: 'recuperacion.no_disponible',
      });
      expect(sinCorrelacion(noExiste.body)).toEqual(
        sinCorrelacion(existe.body),
      );
      expect(enviador.paraCorreo(persona.correo)).toHaveLength(0);
    });

    it('limita a 3 peticiones por minuto por IP: la 4.ª recibe 429', async () => {
      const c = cliente();
      for (let i = 0; i < 3; i++) {
        expect((await olvide(c, correoNuevo())).status).toBe(202);
      }

      expect((await olvide(c, correoNuevo())).status).toBe(429);
    });

    it('rechaza un cuerpo sin correo o con un campo de más: 400', async () => {
      const c = cliente();

      expect(
        (await c.post('/api/v1/auth/olvide-contrasena').send({})).status,
      ).toBe(400);
      expect(
        (
          await c
            .post('/api/v1/auth/olvide-contrasena')
            .send({ correo: 'a@b.co', rol: 'administrador' })
        ).status,
      ).toBe(400);
    });
  });

  // ─── POST /auth/restablecer-contrasena ─────────────────────────────────────────────────────
  describe('POST /auth/restablecer-contrasena', () => {
    it('cambia la contraseña: la nueva entra y la vieja ya no', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);

      const respuesta = await restablecer(c, token);

      expect(respuesta.status).toBe(204);
      expect((await entrar(c, persona.correo, NUEVA)).status).toBe(200);
      expect((await entrar(c, persona.correo, CONTRASENA)).status).toBe(401);
    });

    it('guarda el hash argon2id nuevo y la contraseña nunca queda en la base', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await restablecer(c, await pedirEnlace(c, persona.correo));

      const [credencial] = await filas<{ hash: string }>(
        'select hash from identidad.credenciales where usuario_id = $1',
        [persona.id],
      );

      expect(credencial?.hash).toMatch(/^\$argon2id\$/);
      expect(credencial?.hash).not.toContain(NUEVA);
    });

    it('no inicia sesión: no escribe cookies', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const respuesta = await restablecer(
        c,
        await pedirEnlace(c, persona.correo),
      );

      expect(respuesta.headers['set-cookie']).toBeUndefined();
    });

    it('cierra TODAS las sesiones de la cuenta, en todos los dispositivos', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const otroDispositivo = sesionDe(
        await entrar(c, persona.correo, CONTRASENA),
      );
      expect(await sesionesVigentes(persona.id)).toBe('2');

      await restablecer(c, await pedirEnlace(c, persona.correo));

      expect(await sesionesVigentes(persona.id)).toBe('0');
      const renovar = await c
        .post('/api/v1/auth/refresh')
        .set('Cookie', `seniory_refresco=${otroDispositivo.refresco}`);
      expect(renovar.status).toBe(401);
    });

    it('levanta el bloqueo por intentos fallidos', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      for (let i = 0; i < 5; i++)
        await entrar(c, persona.correo, 'incorrecta-0123456');
      expect((await entrar(c, persona.correo, CONTRASENA)).status).toBe(401); // bloqueada

      await restablecer(c, await pedirEnlace(c, persona.correo));

      expect((await entrar(c, persona.correo, NUEVA)).status).toBe(200);
      const [credencial] = await filas<{
        intentos_fallidos: number;
        bloqueado_hasta: Date | null;
      }>(
        'select intentos_fallidos, bloqueado_hasta from identidad.credenciales where usuario_id = $1',
        [persona.id],
      );
      expect(credencial).toEqual({
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      });
    });

    it('el enlace sirve UNA sola vez', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);
      await restablecer(c, token);

      const segunda = await restablecer(
        c,
        token,
        'una tercera contraseña larga',
      );

      expect(segunda.status).toBe(400);
      expect(segunda.body).toMatchObject({
        codigo: 'recuperacion.enlace_no_valido',
      });
      expect((await entrar(c, persona.correo, NUEVA)).status).toBe(200);
    });

    it('dos usos simultáneos del mismo enlace: uno gana y el otro recibe 400', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);

      const [a, b] = await Promise.all([
        restablecer(c, token, 'una contraseña larga número uno'),
        restablecer(c, token, 'una contraseña larga número dos'),
      ]);

      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([204, 400]);
    });

    it('un enlace vence a los 30 minutos', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);

      reloj.avanzar(30 * MINUTO - 1_000);
      const aTiempo = await restablecer(c, token);
      expect(aTiempo.status).toBe(204);

      const otro = await registrarFamiliar(c);
      const tardio = await pedirEnlace(c, otro.correo);
      reloj.avanzar(30 * MINUTO);
      expect((await restablecer(c, tardio)).status).toBe(400);
    });

    it('un enlace vencido, usado, inventado o de otra forma responden EXACTAMENTE lo mismo', async () => {
      const c = cliente();
      const usada = await registrarFamiliar(c);
      const tokenUsado = await pedirEnlace(c, usada.correo);
      await restablecer(c, tokenUsado);
      const vencida = await registrarFamiliar(c);
      const tokenVencido = await pedirEnlace(c, vencida.correo);
      reloj.avanzar(31 * MINUTO);

      const respuestas = [
        await restablecer(c, tokenUsado),
        await restablecer(c, tokenVencido),
        await restablecer(c, 'x'.repeat(43)),
      ];

      for (const r of respuestas) {
        expect(r.status).toBe(400);
        expect(sinCorrelacion(r.body)).toEqual(
          sinCorrelacion(respuestas[0]?.body),
        );
      }
    });

    it('rechaza una contraseña débil sin gastar el enlace: se puede reintentar con otra', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);

      const comun = await restablecer(c, token, 'QWERTYUIOP');
      const corta = await restablecer(c, token, 'corta');

      expect(comun.body).toMatchObject({ codigo: 'contrasena.comun' });
      expect(corta.body).toMatchObject({ codigo: 'contrasena.largo_invalido' });
      expect((await restablecer(c, token)).status).toBe(204);
    });

    it('una cuenta eliminada después de pedir el enlace no puede usarlo', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);
      await bd.query(
        "update identidad.usuarios set estado = 'eliminado' where id = $1",
        [persona.id],
      );

      expect((await restablecer(c, token)).status).toBe(400);
    });

    it('cambiar la contraseña con la actual invalida los enlaces pendientes', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);
      await cambiar(c, persona, CONTRASENA, NUEVA);

      expect(
        (await restablecer(c, token, 'una tercera contraseña larga')).status,
      ).toBe(400);
    });

    it('queda auditado: lo permitido y lo denegado, sin el token ni la contraseña', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const token = await pedirEnlace(c, persona.correo);
      await restablecer(c, token);
      await restablecer(c, token); // ya usado

      const entradas = await auditoria(
        'identidad.restablecer_contrasena',
        persona.id,
      );

      expect(entradas).toEqual([
        { resultado: 'permitido', metadatos: null },
        { resultado: 'denegado', metadatos: { motivo: 'usado' } },
      ]);
      const todo = JSON.stringify(
        await filas('select * from compartido.auditoria where accion like $1', [
          'identidad.%recuperacion%',
        ]),
      );
      expect(todo).not.toContain(token);
      expect(todo).not.toContain(NUEVA);
    });

    it('rechaza un cuerpo incompleto, con un token de largo imposible o con un campo de más: 400', async () => {
      const c = cliente();
      const enviar = (cuerpo: object) =>
        c.post('/api/v1/auth/restablecer-contrasena').send(cuerpo);

      expect((await enviar({ contrasenaNueva: NUEVA })).status).toBe(400);
      expect((await enviar({ token: 'x'.repeat(43) })).status).toBe(400);
      expect(
        (await enviar({ token: 'corto', contrasenaNueva: NUEVA })).status,
      ).toBe(400);
      expect(
        (
          await enviar({
            token: 'x'.repeat(43),
            contrasenaNueva: NUEVA,
            usuarioId: 'otro',
          })
        ).status,
      ).toBe(400);
    });

    it('limita a 5 intentos por minuto por IP: el 6.º recibe 429', async () => {
      const c = cliente();
      for (let i = 0; i < 5; i++) {
        expect((await restablecer(c, 'x'.repeat(43))).status).toBe(400);
      }

      expect((await restablecer(c, 'x'.repeat(43))).status).toBe(429);
    });
  });

  // ─── PATCH /yo/contrasena ──────────────────────────────────────────────────────────────────
  describe('PATCH /yo/contrasena', () => {
    it('cambia la contraseña, cierra las demás sesiones y deja a quien la cambió con una sesión nueva', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const otroDispositivo = sesionDe(
        await entrar(c, persona.correo, CONTRASENA),
      );

      const respuesta = await cambiar(c, persona, CONTRASENA, NUEVA);

      expect(respuesta.status).toBe(204);
      const nueva = sesionDe(respuesta);
      expect(nueva.acceso).not.toBe(persona.sesion.acceso);
      expect(await sesionesVigentes(persona.id)).toBe('1');
      expect(
        (
          await c
            .post('/api/v1/auth/refresh')
            .set('Cookie', `seniory_refresco=${otroDispositivo.refresco}`)
        ).status,
      ).toBe(401);
      expect(
        (
          await c
            .post('/api/v1/auth/refresh')
            .set('Cookie', `seniory_refresco=${nueva.refresco}`)
        ).status,
      ).toBe(204);
      expect((await entrar(c, persona.correo, NUEVA)).status).toBe(200);
      expect((await entrar(c, persona.correo, CONTRASENA)).status).toBe(401);
    });

    it('una contraseña actual incorrecta responde 400, no cambia nada y cuenta como intento fallido', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      const respuesta = await cambiar(c, persona, 'no es la actual 123', NUEVA);

      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toMatchObject({
        codigo: 'contrasena.actual_incorrecta',
      });
      expect((await entrar(c, persona.correo, CONTRASENA)).status).toBe(200);
      const [credencial] = await filas<{ intentos_fallidos: number }>(
        'select intentos_fallidos from identidad.credenciales where usuario_id = $1',
        [persona.id],
      );
      // 1 intento fallido de este endpoint; el inicio de sesión correcto lo reinició.
      expect(credencial?.intentos_fallidos).toBe(0);
    });

    it('no sirve para adivinar la contraseña con una sesión robada: 5 errores bloquean la cuenta', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);

      // Un atacante que rota de IP no choca con el límite por IP, pero sí con el bloqueo de la cuenta.
      for (let i = 0; i < 5; i++) {
        await cambiar(cliente(), persona, `adivinanza número ${i}`, NUEVA);
      }
      const conLaCorrecta = await cambiar(
        cliente(),
        persona,
        CONTRASENA,
        NUEVA,
      );

      expect(conLaCorrecta.status).toBe(400);
      expect(conLaCorrecta.body).toMatchObject({
        codigo: 'contrasena.actual_incorrecta',
      });
      expect((await entrar(c, persona.correo, CONTRASENA)).status).toBe(401);
    });

    it.each([
      ['la misma contraseña', CONTRASENA, 'contrasena.igual_a_la_actual'],
      ['una contraseña común', 'QWERTYUIOP', 'contrasena.comun'],
      ['una contraseña corta', 'corta', 'contrasena.largo_invalido'],
    ])(
      'rechaza %s como contraseña nueva: 400',
      async (_caso, nueva, codigo) => {
        const c = cliente();
        const persona = await registrarFamiliar(c);

        const respuesta = await cambiar(c, persona, CONTRASENA, nueva);

        expect(respuesta.status).toBe(400);
        expect(respuesta.body).toMatchObject({ codigo });
        expect((await entrar(c, persona.correo, CONTRASENA)).status).toBe(200);
      },
    );

    it('queda auditado, sin las contraseñas', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await cambiar(c, persona, 'no es la actual 123', NUEVA);
      await cambiar(c, persona, CONTRASENA, NUEVA);

      const entradas = await auditoria(
        'identidad.cambiar_contrasena',
        persona.id,
      );

      expect(entradas).toEqual([
        { resultado: 'denegado', metadatos: { motivo: 'actual_incorrecta' } },
        { resultado: 'permitido', metadatos: null },
      ]);
    });

    it('sin sesión responde 401', async () => {
      const respuesta = await cliente()
        .patch('/api/v1/yo/contrasena')
        .send({ contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

      expect(respuesta.status).toBe(401);
    });

    it('rechaza un cuerpo incompleto o con un campo de más: 400', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      const enviar = (cuerpo: object) =>
        c
          .patch('/api/v1/yo/contrasena')
          .set('Cookie', conSesion(persona.sesion))
          .send(cuerpo);

      expect((await enviar({ contrasenaNueva: NUEVA })).status).toBe(400);
      expect((await enviar({ contrasenaActual: CONTRASENA })).status).toBe(400);
      expect(
        (
          await enviar({
            contrasenaActual: CONTRASENA,
            contrasenaNueva: NUEVA,
            correo: 'x@y.co',
          })
        ).status,
      ).toBe(400);
    });

    it('limita a 5 intentos por minuto por IP: el 6.º recibe 429', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      for (let i = 0; i < 5; i++)
        await cambiar(c, persona, `adivinanza número ${i}`, NUEVA);

      expect((await cambiar(c, persona, CONTRASENA, NUEVA)).status).toBe(429);
    });
  });

  // El flujo completo, como lo viviría una persona.
  it('«olvidé mi contraseña» de punta a punta', async () => {
    const c = cliente();
    const persona = await registrarFamiliar(c);
    // Olvida la contraseña, la prueba mal y se bloquea.
    for (let i = 0; i < 5; i++)
      await entrar(c, persona.correo, `me acuerdo así ${i}`);
    expect((await entrar(c, persona.correo, CONTRASENA)).status).toBe(401);

    // Pide el enlace, abre el correo y elige otra.
    const token = await pedirEnlace(c, persona.correo);
    expect(
      (await restablecer(c, token, 'mi contraseña nueva y segura')).status,
    ).toBe(204);

    // Entra con la nueva y ve su perfil.
    const login = await entrar(
      c,
      persona.correo,
      'mi contraseña nueva y segura',
    );
    expect(login.status).toBe(200);
    const perfil = await c
      .get('/api/v1/yo')
      .set('Cookie', conSesion(sesionDe(login)));
    expect(perfil.status).toBe(200);
  });

  // ─── Utilidad compartida por las pruebas de arriba ─────────────────────────────────────────
  function cambiar(
    c: Cliente,
    persona: Persona,
    actual: string,
    nueva: string,
  ) {
    return c
      .patch('/api/v1/yo/contrasena')
      .set('Cookie', conSesion(persona.sesion))
      .send({ contrasenaActual: actual, contrasenaNueva: nueva });
  }
});
