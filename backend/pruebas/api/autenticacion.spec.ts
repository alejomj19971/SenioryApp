import { createHash } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import request from 'supertest';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { RelojFalso } from '../soporte/dobles.js';
import { ControladorDePrueba } from './controlador-de-prueba.js';

// M1 §6 (API) para el PR 3: registro, inicio de sesión, renovación y cierre. Las rutas protegidas se
// prueban con `/prueba/privada` (el perfil `/yo` llega en el PR 4). El reloj es falso y está en el
// futuro: así se avanza el tiempo sin esperar y los eventos que se guardan no los toma el sondeo de
// otras pruebas.

const SECRETO_BFF = 's'.repeat(40);
const INICIO = '2035-03-01T12:00:00.000Z';
const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const CONTRASENA = 'una contraseña larga y única';

const reloj = new RelojFalso(INICIO);
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

// Cada prueba usa su propia IP (la del «navegador» que el BFF declara): los límites de /auth son por
// IP y las pruebas no deben gastarse el cupo unas a otras.
let contadorDeIps = 0;
function nuevaIp(): string {
  const n = ++contadorDeIps;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

interface Sesion {
  acceso: string;
  refresco: string;
}

describe('autenticación (API)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await crearAppDePrueba({
      controladores: [ControladorDePrueba],
      variables: { SECRETO_BFF },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
  });

  beforeEach(() => reloj.fijar(INICIO));

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────
  // Lo que haría el BFF: llegar con el secreto y la IP del navegador.
  function como(ip: string) {
    const conIp = (peticion: request.Test) =>
      peticion.set('X-Seniory-BFF', SECRETO_BFF).set('X-Cliente-IP', ip);
    return {
      post: (ruta: string) => conIp(http().post(ruta)),
      get: (ruta: string) => conIp(http().get(ruta)),
    };
  }
  type Cliente = ReturnType<typeof como>;

  const lineasDeCookies = (respuesta: request.Response): string[] =>
    (respuesta.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

  const cookieEscrita = (respuesta: request.Response, nombre: string) =>
    lineasDeCookies(respuesta).find((linea) => linea.startsWith(`${nombre}=`));

  function sesionDe(respuesta: request.Response): Sesion {
    const valor = (nombre: string) => {
      const linea = cookieEscrita(respuesta, nombre);
      const texto = linea?.split(';')[0]?.slice(nombre.length + 1);
      if (texto === undefined || texto === '') {
        throw new Error(`La respuesta no escribió la cookie ${nombre}`);
      }
      return texto;
    };
    return {
      acceso: valor('seniory_acceso'),
      refresco: valor('seniory_refresco'),
    };
  }

  // Lo que manda un navegador: las dos cookies a /auth, solo la de acceso al resto.
  const cookieDeAcceso = (sesion: Pick<Sesion, 'acceso'>) =>
    `seniory_acceso=${sesion.acceso}`;
  const cookiesDeAuth = (sesion: Sesion) =>
    `${cookieDeAcceso(sesion)}; seniory_refresco=${sesion.refresco}`;

  const correoNuevo = () => `${nuevoId()}@prueba.seniory.invalid`;

  function datosDeRegistro(cambios: Record<string, unknown> = {}) {
    return {
      nombre: 'Andrea Gómez',
      correo: correoNuevo(),
      contrasena: CONTRASENA,
      versionPolitica: 'v1',
      ...cambios,
    };
  }

  async function registrar(cliente: Cliente, cambios = {}) {
    const datos = datosDeRegistro(cambios);
    const respuesta = await cliente.post('/api/v1/auth/registro').send(datos);
    return { datos, respuesta };
  }

  async function registrarYEntrar(cliente: Cliente) {
    const { datos, respuesta } = await registrar(cliente);
    expect(respuesta.status).toBe(201);
    return {
      correo: datos.correo,
      usuarioId: (respuesta.body as { usuario: { id: string } }).usuario.id,
      sesion: sesionDe(respuesta),
    };
  }

  const iniciarSesion = (
    cliente: Cliente,
    correo: string,
    contrasena = CONTRASENA,
  ) => cliente.post('/api/v1/auth/login').send({ correo, contrasena });

  const renovar = (cliente: Cliente, sesion: Sesion) =>
    cliente.post('/api/v1/auth/refresh').set('Cookie', cookiesDeAuth(sesion));

  const sha256 = (texto: string) => createHash('sha256').update(texto).digest();

  const bloqueoDe = async (correo: string) =>
    (
      await filas<{ intentos_fallidos: number; bloqueado_hasta: Date | null }>(
        `select c.intentos_fallidos, c.bloqueado_hasta
         from identidad.credenciales c join identidad.usuarios u on u.id = c.usuario_id
         where u.correo = $1`,
        [correo],
      )
    )[0];

  const auditoriaDe = (accion: string, usuarioId: string) =>
    filas<{ resultado: string; actor_id: string | null; metadatos: unknown }>(
      `select resultado, actor_id, metadatos from compartido.auditoria
       where accion = $1 and (actor_id = $2::uuid or recurso_id = $2::text) order by ocurrido_en, id`,
      [accion, usuarioId],
    );

  // ─── Registro ──────────────────────────────────────────────────────────────────────────────
  describe('POST /auth/registro', () => {
    it('crea una cuenta de familiar, inicia la sesión y no devuelve tokens en el cuerpo', async () => {
      const cliente = como(nuevaIp());
      const { datos, respuesta } = await registrar(cliente, {
        correo: `  Andrea.${nuevoId()}@Prueba.Seniory.invalid `,
        telefono: '+573001234567',
      });

      expect(respuesta.status).toBe(201);
      const cuerpo = respuesta.body as { usuario: Record<string, unknown> };
      expect(Object.keys(cuerpo)).toEqual(['usuario']);
      expect(cuerpo.usuario).toEqual({
        id: expect.any(String),
        nombre: 'Andrea Gómez',
        correo: datos.correo.trim().toLowerCase(),
        rol: 'familiar',
      });
      const sesion = sesionDe(respuesta);
      expect(JSON.stringify(cuerpo)).not.toContain(sesion.acceso);
      expect(JSON.stringify(cuerpo)).not.toContain(sesion.refresco);
    });

    it('escribe las cookies HttpOnly y SameSite=Lax; el refresco solo viaja a /api/v1/auth', async () => {
      const { respuesta } = await registrar(como(nuevaIp()));

      const acceso = cookieEscrita(respuesta, 'seniory_acceso') ?? '';
      const refresco = cookieEscrita(respuesta, 'seniory_refresco') ?? '';
      for (const cookie of [acceso, refresco]) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Expires=');
      }
      expect(acceso).toContain('Path=/;');
      expect(refresco).toContain('Path=/api/v1/auth');
    });

    it('guarda solo el hash argon2id de la contraseña y el SHA-256 del token de refresco', async () => {
      const { datos, respuesta } = await registrar(como(nuevaIp()));
      const sesion = sesionDe(respuesta);

      const [credencial] = await filas<{ hash: string }>(
        `select c.hash from identidad.credenciales c join identidad.usuarios u on u.id = c.usuario_id
         where u.correo = $1`,
        [datos.correo],
      );
      expect(credencial?.hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(credencial?.hash).not.toContain(CONTRASENA);

      const guardadas = await filas<{ hash_del_token: Buffer }>(
        `select s.hash_del_token from identidad.sesiones_refresco s join identidad.usuarios u on u.id = s.usuario_id
         where u.correo = $1`,
        [datos.correo],
      );
      expect(guardadas).toHaveLength(1);
      expect(guardadas[0]?.hash_del_token.equals(sha256(sesion.refresco))).toBe(
        true,
      );
    });

    it('deja registrada la aceptación de la política con su versión', async () => {
      const { respuesta } = await registrar(como(nuevaIp()));
      const usuarioId = (respuesta.body as { usuario: { id: string } }).usuario
        .id;

      const aceptaciones = await filas<{ version: string; aceptada_en: Date }>(
        'select version, aceptada_en from identidad.aceptaciones_de_politica where usuario_id = $1',
        [usuarioId],
      );

      expect(aceptaciones).toEqual([
        { version: 'v1', aceptada_en: new Date(INICIO) },
      ]);
    });

    it('publica usuario_registrado con solo el id y el rol, sin datos personales', async () => {
      const { datos, respuesta } = await registrar(como(nuevaIp()));
      const usuarioId = (respuesta.body as { usuario: { id: string } }).usuario
        .id;

      const eventos = await filas<{ version: number; datos: unknown }>(
        `select version, datos from compartido.outbox
         where tipo = 'identidad.usuario_registrado' and datos->>'usuarioId' = $1`,
        [usuarioId],
      );

      expect(eventos).toEqual([
        { version: 1, datos: { usuarioId, rol: 'familiar' } },
      ]);
      expect(JSON.stringify(eventos)).not.toContain(datos.correo);
    });

    it('audita el registro sin el correo', async () => {
      const { datos, respuesta } = await registrar(como(nuevaIp()));
      const usuarioId = (respuesta.body as { usuario: { id: string } }).usuario
        .id;

      const entradas = await auditoriaDe(
        'identidad.registrar_usuario',
        usuarioId,
      );

      expect(entradas).toEqual([
        {
          resultado: 'permitido',
          actor_id: usuarioId,
          metadatos: { versionPolitica: 'v1' },
        },
      ]);
      expect(JSON.stringify(entradas)).not.toContain(datos.correo);
    });

    it('no acepta el campo rol: 400 y no se crea la cuenta', async () => {
      const cliente = como(nuevaIp());
      const correo = correoNuevo();

      const respuesta = await cliente
        .post('/api/v1/auth/registro')
        .send({ ...datosDeRegistro({ correo }), rol: 'administrador' });

      expect(respuesta.status).toBe(400);
      expect(JSON.stringify(respuesta.body)).toContain('rol');
      expect(
        await filas('select 1 from identidad.usuarios where correo = $1', [
          correo,
        ]),
      ).toHaveLength(0);
    });

    it('rechaza un correo ya registrado, también con otras mayúsculas: 409', async () => {
      const cliente = como(nuevaIp());
      const { datos } = await registrar(cliente);

      for (const correo of [datos.correo, datos.correo.toUpperCase()]) {
        const respuesta = await cliente
          .post('/api/v1/auth/registro')
          .send(datosDeRegistro({ correo }));

        expect(respuesta.status).toBe(409);
        expect(respuesta.body).toMatchObject({
          codigo: 'usuario.correo_ya_registrado',
        });
      }
    });

    it.each([
      [
        'una contraseña común',
        { contrasena: 'QWERTYUIOP' },
        'contrasena.comun',
      ],
      [
        'una contraseña corta',
        { contrasena: 'corta' },
        'contrasena.largo_invalido',
      ],
      [
        'una versión de la política que no es la vigente',
        { versionPolitica: 'v0' },
        'politica.version_no_vigente',
      ],
      ['un correo inválido', { correo: 'no-es-un-correo' }, undefined],
      [
        'un teléfono sin formato internacional',
        { telefono: '3001234567' },
        undefined,
      ],
      ['un nombre vacío', { nombre: '   ' }, 'nombre.invalido'],
    ])('rechaza %s: 400', async (_caso, cambios, codigo) => {
      const respuesta = await como(nuevaIp())
        .post('/api/v1/auth/registro')
        .send(datosDeRegistro(cambios));

      expect(respuesta.status).toBe(400);
      if (codigo !== undefined)
        expect(respuesta.body).toMatchObject({ codigo });
    });

    it.each(['nombre', 'correo', 'contrasena', 'versionPolitica'])(
      'rechaza un registro sin %s: 400',
      async (campo) => {
        const datos: Record<string, unknown> = datosDeRegistro();
        delete datos[campo];

        const respuesta = await como(nuevaIp())
          .post('/api/v1/auth/registro')
          .send(datos);

        expect(respuesta.status).toBe(400);
      },
    );

    it('limita a 5 registros por minuto por IP: el 6.º recibe 429; otra IP no se ve afectada', async () => {
      const cliente = como(nuevaIp());
      for (let i = 0; i < 5; i++) {
        expect((await registrar(cliente)).respuesta.status).toBe(201);
      }

      const sexta = await registrar(cliente);
      const deOtraIp = await registrar(como(nuevaIp()));

      expect(sexta.respuesta.status).toBe(429);
      expect(sexta.respuesta.body).toMatchObject({
        codigo: 'demasiadas_solicitudes',
      });
      expect(deOtraIp.respuesta.status).toBe(201);
    });
  });

  // ─── Inicio de sesión ──────────────────────────────────────────────────────────────────────
  describe('POST /auth/login', () => {
    it('inicia sesión con el correo en cualquier mayúscula y devuelve solo el usuario', async () => {
      const cliente = como(nuevaIp());
      const { correo, usuarioId } = await registrarYEntrar(cliente);

      const respuesta = await iniciarSesion(cliente, correo.toUpperCase());

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        usuario: {
          id: usuarioId,
          nombre: 'Andrea Gómez',
          correo,
          rol: 'familiar',
        },
      });
      expect(() => sesionDe(respuesta)).not.toThrow();
      expect(await auditoriaDe('identidad.iniciar_sesion', usuarioId)).toEqual([
        { resultado: 'permitido', actor_id: usuarioId, metadatos: null },
      ]);
    });

    it('cada inicio de sesión abre una familia de sesiones distinta', async () => {
      const cliente = como(nuevaIp());
      const { correo, usuarioId } = await registrarYEntrar(cliente);
      await iniciarSesion(cliente, correo);

      const familias = await filas<{ familia_id: string }>(
        'select distinct familia_id from identidad.sesiones_refresco where usuario_id = $1',
        [usuarioId],
      );

      expect(familias).toHaveLength(2);
    });

    it('un correo sin cuenta, una contraseña errónea y un correo mal formado responden EXACTAMENTE lo mismo', async () => {
      const cliente = como(nuevaIp());
      const { correo } = await registrarYEntrar(cliente);

      const respuestas = [
        await iniciarSesion(cliente, correo, 'otra contraseña distinta'),
        await iniciarSesion(cliente, correoNuevo()),
        await iniciarSesion(cliente, 'esto no es un correo'),
      ];

      const sinCorrelacion = respuestas.map((r) => {
        const { idDeCorrelacion: _id, ...resto } = r.body as Record<
          string,
          unknown
        >;
        return { estado: r.status, cuerpo: resto, cookies: lineasDeCookies(r) };
      });
      expect(sinCorrelacion[0]).toEqual({
        estado: 401,
        cuerpo: {
          type: 'urn:seniory:problema:auth.credenciales_invalidas',
          title: 'Debes iniciar sesión',
          status: 401,
          codigo: 'auth.credenciales_invalidas',
          detail: 'El correo o la contraseña no son correctos',
        },
        cookies: [],
      });
      expect(sinCorrelacion[1]).toEqual(sinCorrelacion[0]);
      expect(sinCorrelacion[2]).toEqual(sinCorrelacion[0]);
    });

    it('audita cada intento fallido con su motivo, sin correo ni contraseña', async () => {
      const cliente = como(nuevaIp());
      const { correo, usuarioId } = await registrarYEntrar(cliente);
      const desconocido = correoNuevo();

      await iniciarSesion(cliente, correo, 'otra contraseña distinta');
      await iniciarSesion(cliente, desconocido, 'otra contraseña distinta');

      expect(await auditoriaDe('identidad.iniciar_sesion', usuarioId)).toEqual([
        {
          resultado: 'denegado',
          actor_id: usuarioId,
          metadatos: { motivo: 'contrasena_incorrecta', bloqueada: false },
        },
      ]);
      const sinCuenta = await filas<{
        metadatos: unknown;
        actor_id: string | null;
      }>(
        `select metadatos, actor_id from compartido.auditoria
         where accion = 'identidad.iniciar_sesion' and actor_id is null
           and metadatos->>'motivo' = 'cuenta_desconocida'`,
      );
      expect(sinCuenta.length).toBeGreaterThan(0);
      const todo = JSON.stringify(
        await filas('select * from compartido.auditoria where accion = $1', [
          'identidad.iniciar_sesion',
        ]),
      );
      expect(todo).not.toContain(correo);
      expect(todo).not.toContain(desconocido);
      expect(todo).not.toContain('otra contraseña distinta');
    });

    it('la quinta contraseña errónea bloquea la cuenta 15 minutos, aun con la contraseña correcta', async () => {
      const cliente = como(nuevaIp());
      const { correo } = await registrarYEntrar(cliente);
      for (let i = 0; i < 5; i++)
        await iniciarSesion(cliente, correo, 'incorrecta-0123456');

      const conLaCorrecta = await iniciarSesion(cliente, correo);

      expect(conLaCorrecta.status).toBe(401);
      expect(conLaCorrecta.body).toMatchObject({
        codigo: 'auth.credenciales_invalidas',
      });
      expect((await bloqueoDe(correo))?.bloqueado_hasta).toEqual(
        new Date(Date.parse(INICIO) + 15 * MINUTO),
      );
    });

    it('los intentos durante el bloqueo no cuentan ni lo extienden; al vencer, la cuenta vuelve a entrar y el contador se reinicia', async () => {
      const cliente = como(nuevaIp());
      const { correo } = await registrarYEntrar(cliente);
      for (let i = 0; i < 5; i++)
        await iniciarSesion(cliente, correo, 'incorrecta-0123456');
      const bloqueo = await bloqueoDe(correo);

      reloj.avanzar(10 * MINUTO);
      for (let i = 0; i < 3; i++)
        await iniciarSesion(cliente, correo, 'incorrecta-0123456');

      expect(await bloqueoDe(correo)).toEqual(bloqueo);
      expect(bloqueo?.intentos_fallidos).toBe(5);

      reloj.avanzar(5 * MINUTO + 1);
      const entra = await iniciarSesion(cliente, correo);

      expect(entra.status).toBe(200);
      expect(await bloqueoDe(correo)).toEqual({
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      });
    });

    it('el segundo bloqueo dura el doble (30 minutos)', async () => {
      const cliente = como(nuevaIp());
      const { correo } = await registrarYEntrar(cliente);
      for (let i = 0; i < 5; i++)
        await iniciarSesion(cliente, correo, 'incorrecta-0123456');
      reloj.avanzar(15 * MINUTO + 1);

      for (let i = 0; i < 5; i++)
        await iniciarSesion(cliente, correo, 'incorrecta-0123456');

      expect((await bloqueoDe(correo))?.bloqueado_hasta).toEqual(
        new Date(reloj.ahora().getTime() + 30 * MINUTO),
      );
    });

    it('intentos simultáneos no se pierden: 8 a la vez dejan el contador en 5 y la cuenta bloqueada', async () => {
      const cliente = como(nuevaIp());
      const { correo } = await registrarYEntrar(cliente);

      await Promise.all(
        Array.from({ length: 8 }, () =>
          iniciarSesion(cliente, correo, 'incorrecta-0123456'),
        ),
      );

      const bloqueo = await bloqueoDe(correo);
      expect(bloqueo?.intentos_fallidos).toBe(5);
      expect(bloqueo?.bloqueado_hasta).not.toBeNull();
    });

    it('una cuenta eliminada no entra, aunque la contraseña sea correcta', async () => {
      const cliente = como(nuevaIp());
      const { correo, usuarioId } = await registrarYEntrar(cliente);
      await bd.query(
        "update identidad.usuarios set estado = 'eliminado' where id = $1",
        [usuarioId],
      );

      const respuesta = await iniciarSesion(cliente, correo);

      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toMatchObject({
        codigo: 'auth.credenciales_invalidas',
      });
    });

    it('limita a 10 inicios de sesión por minuto por IP: el 11.º recibe 429', async () => {
      const cliente = como(nuevaIp());
      const correo = correoNuevo();
      for (let i = 0; i < 10; i++) {
        expect((await iniciarSesion(cliente, correo)).status).toBe(401);
      }

      expect((await iniciarSesion(cliente, correo)).status).toBe(429);
    });

    it.each([
      ['sin correo', { contrasena: CONTRASENA }],
      ['sin contraseña', { correo: 'a@b.co' }],
      [
        'con una contraseña enorme',
        { correo: 'a@b.co', contrasena: 'x'.repeat(513) },
      ],
      [
        'con un campo de más',
        { correo: 'a@b.co', contrasena: CONTRASENA, rol: 'administrador' },
      ],
    ])('rechaza un cuerpo %s: 400', async (_caso, cuerpo) => {
      const respuesta = await como(nuevaIp())
        .post('/api/v1/auth/login')
        .send(cuerpo);

      expect(respuesta.status).toBe(400);
    });
  });

  // ─── Renovación ────────────────────────────────────────────────────────────────────────────
  describe('POST /auth/refresh', () => {
    it('entrega un par nuevo de la misma familia y deja el anterior como reemplazado', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);
      reloj.avanzar(5 * MINUTO);

      const respuesta = await renovar(cliente, sesion);

      expect(respuesta.status).toBe(204);
      expect(respuesta.text).toBe('');
      const nueva = sesionDe(respuesta);
      expect(nueva.refresco).not.toBe(sesion.refresco);
      expect(nueva.acceso).not.toBe(sesion.acceso);
      const guardadas = await filas<{
        hash_del_token: Buffer;
        familia_id: string;
        reemplazada_en: Date | null;
        reemplazada_por: string | null;
        id: string;
      }>(
        'select id, hash_del_token, familia_id, reemplazada_en, reemplazada_por from identidad.sesiones_refresco where usuario_id = $1',
        [usuarioId],
      );
      expect(guardadas).toHaveLength(2);
      expect(new Set(guardadas.map((g) => g.familia_id)).size).toBe(1);
      const vieja = guardadas.find((g) =>
        g.hash_del_token.equals(sha256(sesion.refresco)),
      );
      const reciente = guardadas.find((g) =>
        g.hash_del_token.equals(sha256(nueva.refresco)),
      );
      expect(vieja?.reemplazada_en).toEqual(reloj.ahora());
      expect(vieja?.reemplazada_por).toBe(reciente?.id);
      expect(reciente?.reemplazada_en).toBeNull();
    });

    it('el token de acceso nuevo funciona', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);
      const nueva = sesionDe(await renovar(cliente, sesion));

      const privada = await cliente
        .get('/api/v1/prueba/privada')
        .set('Cookie', cookieDeAcceso(nueva));

      expect(privada.status).toBe(200);
      expect(privada.body).toEqual({ id: usuarioId, rol: 'familiar' });
    });

    it('sin cookie, con un token inventado o con un token de acceso responde 401 y borra las cookies', async () => {
      const cliente = como(nuevaIp());
      const { sesion } = await registrarYEntrar(cliente);

      const intentos = [
        await cliente.post('/api/v1/auth/refresh'),
        await cliente
          .post('/api/v1/auth/refresh')
          .set('Cookie', 'seniory_refresco=inventado'),
        await cliente
          .post('/api/v1/auth/refresh')
          .set('Cookie', `seniory_refresco=${sesion.acceso}`),
      ];

      for (const respuesta of intentos) {
        expect(respuesta.status).toBe(401);
        expect(respuesta.body).toMatchObject({ codigo: expect.any(String) });
        for (const nombre of ['seniory_acceso', 'seniory_refresco']) {
          expect(cookieEscrita(respuesta, nombre)).toMatch(
            /^[a-z_]+=;.*Expires=Thu, 01 Jan 1970/,
          );
        }
      }
    });

    it('el token de refresco no sirve como token de acceso', async () => {
      const cliente = como(nuevaIp());
      const { sesion } = await registrarYEntrar(cliente);

      const respuesta = await cliente
        .get('/api/v1/prueba/privada')
        .set('Cookie', `seniory_acceso=${sesion.refresco}`);

      expect(respuesta.status).toBe(401);
    });

    it('un token ya reemplazado todavía se acepta durante 30 segundos, y conserva la primera marca de reemplazo', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);
      await renovar(cliente, sesion);
      const primeraMarca = reloj.ahora();
      reloj.avanzar(20_000);

      const segunda = await renovar(cliente, sesion);

      expect(segunda.status).toBe(204);
      const [vieja] = await filas<{ reemplazada_en: Date }>(
        'select reemplazada_en from identidad.sesiones_refresco where usuario_id = $1 and hash_del_token = $2',
        [usuarioId, sha256(sesion.refresco)],
      );
      expect(vieja?.reemplazada_en).toEqual(primeraMarca);
    });

    it('dos renovaciones simultáneas con el mismo token reciben ambas un par válido de la misma familia', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);

      const [a, b] = await Promise.all([
        renovar(cliente, sesion),
        renovar(cliente, sesion),
      ]);

      expect([a.status, b.status]).toEqual([204, 204]);
      const parA = sesionDe(a);
      const parB = sesionDe(b);
      expect(parA.refresco).not.toBe(parB.refresco);
      const guardadas = await filas<{
        familia_id: string;
        revocada_en: Date | null;
      }>(
        'select familia_id, revocada_en from identidad.sesiones_refresco where usuario_id = $1',
        [usuarioId],
      );
      expect(guardadas).toHaveLength(3);
      expect(new Set(guardadas.map((g) => g.familia_id)).size).toBe(1);
      expect(guardadas.every((g) => g.revocada_en === null)).toBe(true);
      // Y la sesión sigue activa: cualquiera de los dos pares sigue renovando.
      expect((await renovar(cliente, parA)).status).toBe(204);
      expect((await renovar(cliente, parB)).status).toBe(204);
    });

    it('un token reemplazado que reaparece después de 30 s es un robo: 401 y toda la familia queda revocada', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);
      const legitima = sesionDe(await renovar(cliente, sesion));
      reloj.avanzar(31_000);

      const robado = await renovar(cliente, sesion);

      expect(robado.status).toBe(401);
      // La sesión legítima también queda fuera: solo tiene que volver a iniciar sesión.
      expect((await renovar(cliente, legitima)).status).toBe(401);
      const guardadas = await filas<{ revocada_en: Date | null }>(
        'select revocada_en from identidad.sesiones_refresco where usuario_id = $1',
        [usuarioId],
      );
      expect(guardadas.every((g) => g.revocada_en !== null)).toBe(true);
      expect(
        await auditoriaDe('identidad.revocar_familia_de_sesiones', usuarioId),
      ).toEqual([
        {
          resultado: 'denegado',
          actor_id: usuarioId,
          metadatos: { motivo: 'reutilizada' },
        },
      ]);
    });

    it('no revoca las sesiones de otros dispositivos', async () => {
      const cliente = como(nuevaIp());
      const { correo, sesion } = await registrarYEntrar(cliente);
      const otroDispositivo = sesionDe(await iniciarSesion(cliente, correo));
      await renovar(cliente, sesion);
      reloj.avanzar(31_000);

      await renovar(cliente, sesion); // reutilización: revoca SOLO la familia del primer dispositivo

      expect((await renovar(cliente, otroDispositivo)).status).toBe(204);
    });

    it('un token vencido (30 días) responde 401', async () => {
      const cliente = como(nuevaIp());
      const { sesion } = await registrarYEntrar(cliente);
      reloj.avanzar(30 * DIA + 1);

      expect((await renovar(cliente, sesion)).status).toBe(401);
    });

    it('relee el rol de la base: un cambio de rol se aplica al renovar', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);
      const solo = (s: Pick<Sesion, 'acceso'>) =>
        cliente
          .get('/api/v1/prueba/solo-administradores')
          .set('Cookie', cookieDeAcceso(s));
      expect((await solo(sesion)).status).toBe(403);
      await bd.query(
        "update identidad.usuarios set rol = 'administrador' where id = $1",
        [usuarioId],
      );

      const nueva = sesionDe(await renovar(cliente, sesion));

      expect((await solo(sesion)).status).toBe(403); // el token viejo conserva su rol hasta vencer
      expect((await solo(nueva)).status).toBe(200);
    });

    it('si la cuenta fue eliminada, no renueva y revoca la familia', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);
      await bd.query(
        "update identidad.usuarios set estado = 'eliminado' where id = $1",
        [usuarioId],
      );

      expect((await renovar(cliente, sesion)).status).toBe(401);

      const guardadas = await filas<{ revocada_en: Date | null }>(
        'select revocada_en from identidad.sesiones_refresco where usuario_id = $1',
        [usuarioId],
      );
      expect(guardadas.every((g) => g.revocada_en !== null)).toBe(true);
    });
  });

  // ─── Cierre de sesión ──────────────────────────────────────────────────────────────────────
  describe('POST /auth/logout', () => {
    it('revoca la familia, borra las cookies y el refresco deja de servir', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);
      const renovada = sesionDe(await renovar(cliente, sesion));

      const respuesta = await cliente
        .post('/api/v1/auth/logout')
        .set('Cookie', cookiesDeAuth(renovada));

      expect(respuesta.status).toBe(204);
      for (const nombre of ['seniory_acceso', 'seniory_refresco']) {
        expect(cookieEscrita(respuesta, nombre)).toMatch(
          /^[a-z_]+=;.*Expires=Thu, 01 Jan 1970/,
        );
      }
      expect((await renovar(cliente, renovada)).status).toBe(401);
      expect((await renovar(cliente, sesion)).status).toBe(401);
      expect(await auditoriaDe('identidad.cerrar_sesion', usuarioId)).toEqual([
        { resultado: 'permitido', actor_id: usuarioId, metadatos: null },
      ]);
    });

    it('registro → ruta protegida → cierre de sesión → ruta protegida sin cookie: 401', async () => {
      const cliente = como(nuevaIp());
      const { sesion } = await registrarYEntrar(cliente);
      expect(
        (
          await cliente
            .get('/api/v1/prueba/privada')
            .set('Cookie', cookieDeAcceso(sesion))
        ).status,
      ).toBe(200);

      await cliente
        .post('/api/v1/auth/logout')
        .set('Cookie', cookiesDeAuth(sesion));

      // El navegador borró las cookies con la respuesta: la siguiente petición va sin ellas.
      expect((await cliente.get('/api/v1/prueba/privada')).status).toBe(401);
    });

    it('no cierra las sesiones de otros dispositivos', async () => {
      const cliente = como(nuevaIp());
      const { correo, sesion } = await registrarYEntrar(cliente);
      const otroDispositivo = sesionDe(await iniciarSesion(cliente, correo));

      await cliente
        .post('/api/v1/auth/logout')
        .set('Cookie', cookiesDeAuth(sesion));

      expect((await renovar(cliente, otroDispositivo)).status).toBe(204);
    });

    it.each([
      ['sin cookie', undefined],
      ['con un token que no existe', 'seniory_refresco=inventado'],
    ])('es idempotente: %s responde 204 igual', async (_caso, cookie) => {
      const cliente = como(nuevaIp());
      const peticion = cliente.post('/api/v1/auth/logout');
      const respuesta = await (cookie === undefined
        ? peticion
        : peticion.set('Cookie', cookie));

      expect(respuesta.status).toBe(204);
    });
  });

  // ─── Token de acceso ───────────────────────────────────────────────────────────────────────
  describe('token de acceso', () => {
    it('autentica la ruta protegida con el id y el rol del token', async () => {
      const cliente = como(nuevaIp());
      const { sesion, usuarioId } = await registrarYEntrar(cliente);

      const respuesta = await cliente
        .get('/api/v1/prueba/privada')
        .set('Cookie', cookieDeAcceso(sesion));

      expect(respuesta.body).toEqual({ id: usuarioId, rol: 'familiar' });
    });

    it('vale 15 minutos', async () => {
      const cliente = como(nuevaIp());
      const { sesion } = await registrarYEntrar(cliente);
      const privada = () =>
        cliente
          .get('/api/v1/prueba/privada')
          .set('Cookie', cookieDeAcceso(sesion));

      reloj.avanzar(15 * MINUTO - 1_000);
      expect((await privada()).status).toBe(200);

      reloj.avanzar(1_000);
      expect((await privada()).status).toBe(401);
    });

    it('un familiar no entra a una ruta de administradores: 403', async () => {
      const cliente = como(nuevaIp());
      const { sesion } = await registrarYEntrar(cliente);

      const respuesta = await cliente
        .get('/api/v1/prueba/solo-administradores')
        .set('Cookie', cookieDeAcceso(sesion));

      expect(respuesta.status).toBe(403);
    });

    it('un token alterado responde 401', async () => {
      const cliente = como(nuevaIp());
      const { sesion } = await registrarYEntrar(cliente);
      const alterado = `${sesion.acceso.slice(0, -4)}AAAA`;

      const respuesta = await cliente
        .get('/api/v1/prueba/privada')
        .set('Cookie', cookieDeAcceso({ acceso: alterado }));

      expect(respuesta.status).toBe(401);
    });
  });

  // ─── Lo que nunca debe salir ───────────────────────────────────────────────────────────────
  describe('lo que nunca debe salir en una respuesta', () => {
    it('ninguna respuesta de /auth incluye hash, contador de intentos ni tokens en el cuerpo', async () => {
      const cliente = como(nuevaIp());
      const { correo, sesion } = await registrarYEntrar(cliente);
      const respuestas = [
        await iniciarSesion(cliente, correo),
        await iniciarSesion(cliente, correo, 'otra contraseña distinta'),
        await renovar(cliente, sesion),
      ];

      for (const respuesta of respuestas) {
        const cuerpo = JSON.stringify(respuesta.body);
        expect(cuerpo).not.toMatch(
          /hash|intentos|bloqueado|argon2|eyJ|contrasena/i,
        );
      }
    });
  });
});
