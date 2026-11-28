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
  SECRETO_BFF,
  type Cliente,
  type Persona,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import { EnviadorDeRecuperacionEnMemoria } from '../soporte/enviador-de-recuperacion.js';
import { ControladorDePrueba } from './controlador-de-prueba.js';

// Confirmar que el correo es de la persona, y cuentas suspendidas (M1). El reloj es falso y está en 2035 para avanzar el
// tiempo sin esperar.

const INICIO = '2035-03-01T12:00:00.000Z';
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
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

describe('verificación del correo y cuentas suspendidas (API)', () => {
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

  // ─── Ayudas ──────────────────────────────────────────────────────
  const cliente = () => como(app, nuevaIp());

  const verificar = (c: Cliente, token: string) =>
    c.post('/api/v1/auth/verificar-correo').send({ token });

  const pedirOtro = (c: Cliente, persona: Persona) =>
    c
      .post('/api/v1/yo/correo/verificacion')
      .set('Cookie', conSesion(persona.sesion));

  const perfil = (c: Cliente, persona: Persona) =>
    c.get('/api/v1/yo').set('Cookie', conSesion(persona.sesion));

  // El enlace sale sin que el registro lo espere: se aguarda a que llegue al canal.
  async function esperarEnlace(correo: string, cantidad = 1): Promise<void> {
    const limite = Date.now() + 5_000;
    while (enviador.verificacionesParaCorreo(correo).length < cantidad) {
      if (Date.now() > limite) {
        throw new Error(`No llegó el enlace de verificación para ${correo}`);
      }
      await new Promise((resolver) => setTimeout(resolver, 20));
    }
  }

  const tokenDelUltimoEnlace = (correo: string): string => {
    const mensajes = enviador.verificacionesParaCorreo(correo);
    const ultimo = mensajes[mensajes.length - 1];
    if (ultimo === undefined) throw new Error('No hay enlace de verificación');
    return EnviadorDeRecuperacionEnMemoria.tokenDe(ultimo);
  };

  const correoVerificadoEn = async (usuarioId: string) =>
    (
      await filas<{ correo_verificado_en: Date | null }>(
        'select correo_verificado_en from identidad.usuarios where id = $1',
        [usuarioId],
      )
    )[0]?.correo_verificado_en;

  // ─── Al registrarse ──────────────────────────────────────────────
  describe('al registrarse', () => {
    it('le llega un enlace al frontend con un token de 256 bits que vence en 24 horas, y el correo queda sin verificar', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);

      const [mensaje] = enviador.verificacionesParaCorreo(persona.correo);
      expect(mensaje).toMatchObject({
        nombre: 'Andrea Gómez',
        correo: persona.correo,
        expiraEn: new Date(Date.parse(INICIO) + 24 * HORA),
      });
      expect(mensaje?.enlace).toMatch(
        /^http:\/\/localhost:3000\/verificar-correo\?token=[A-Za-z0-9_-]{43}$/,
      );
      expect(await correoVerificadoEn(persona.id)).toBeNull();
      const vista = await perfil(c, persona);
      expect(vista.status).toBe(200);
      expect(
        (vista.body as { usuario: { correoVerificado: boolean } }).usuario
          .correoVerificado,
      ).toBe(false);
    });

    it('en la base solo queda el SHA-256 del token, y en SU tabla (no en la de recuperación)', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);
      const token = tokenDelUltimoEnlace(persona.correo);

      const guardados = await filas<{ hash_del_token: Buffer }>(
        'select hash_del_token from identidad.tokens_de_verificacion_de_correo where usuario_id = $1',
        [persona.id],
      );
      const deRecuperacion = await filas(
        'select 1 from identidad.tokens_de_recuperacion where usuario_id = $1',
        [persona.id],
      );
      expect(guardados).toHaveLength(1);
      expect(guardados[0]?.hash_del_token.equals(sha256(token))).toBe(true);
      expect(deRecuperacion).toHaveLength(0);
    });

    it('si no hay canal de correo, el registro sale bien igual (y no hay enlace)', async () => {
      enviador.disponible = false;
      const c = cliente();

      const persona = await registrarFamiliar(c);

      expect(persona.id).toBeDefined();
      await new Promise((resolver) => setTimeout(resolver, 150));
      expect(enviador.verificacionesParaCorreo(persona.correo)).toHaveLength(0);
    });

    it('si el canal falla, el registro sale bien igual: la persona puede pedir otro enlace', async () => {
      enviador.falla = true;
      const c = cliente();

      const persona = await registrarFamiliar(c);

      expect(persona.id).toBeDefined();
      const respuesta = await perfil(c, persona);
      expect(respuesta.status).toBe(200);
    });
  });

  // ─── Confirmar con el enlace ─────────────────────────────────────
  describe('POST /auth/verificar-correo', () => {
    it('con el enlace del correo, lo marca como verificado y gasta el enlace', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);

      const respuesta = await verificar(
        c,
        tokenDelUltimoEnlace(persona.correo),
      );

      expect(respuesta.status).toBe(204);
      expect(await correoVerificadoEn(persona.id)).toEqual(new Date(INICIO));
      const vista = await perfil(c, persona);
      expect(
        (vista.body as { usuario: { correoVerificado: boolean } }).usuario
          .correoVerificado,
      ).toBe(true);
      const usados = await filas(
        'select 1 from identidad.tokens_de_verificacion_de_correo where usuario_id = $1 and usado_en is not null',
        [persona.id],
      );
      expect(usados).toHaveLength(1);
    });

    it('no hace falta tener la sesión abierta: se confirma desde otro navegador', async () => {
      const persona = await registrarFamiliar(cliente());
      await esperarEnlace(persona.correo);

      const otroNavegador = cliente();
      const respuesta = await verificar(
        otroNavegador,
        tokenDelUltimoEnlace(persona.correo),
      );

      expect(respuesta.status).toBe(204);
    });

    it('abrirlo dos veces no asusta a nadie: la segunda también responde bien y no cambia la fecha', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);
      const token = tokenDelUltimoEnlace(persona.correo);
      await verificar(c, token);
      reloj.avanzar(10 * MINUTO);

      const segunda = await verificar(c, token);

      expect(segunda.status).toBe(204);
      expect(await correoVerificadoEn(persona.id)).toEqual(new Date(INICIO));
    });

    it('un enlace vencido, uno inventado y uno de otro tipo se rechazan igual (400), sin decir cuál fue el error', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);
      const token = tokenDelUltimoEnlace(persona.correo);
      reloj.avanzar(24 * HORA + MINUTO);

      const vencido = await verificar(c, token);
      const inventado = await verificar(c, 'x'.repeat(43));

      for (const respuesta of [vencido, inventado]) {
        expect(respuesta.status).toBe(400);
        expect(respuesta.body).toMatchObject({
          codigo: 'verificacion_de_correo.enlace_no_valido',
        });
      }
      expect(await correoVerificadoEn(persona.id)).toBeNull();
    });

    it('el enlace de recuperar la contraseña NO sirve para verificar el correo', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await c
        .post('/api/v1/auth/olvide-contrasena')
        .send({ correo: persona.correo });
      const deRecuperacion = EnviadorDeRecuperacionEnMemoria.tokenDe(
        enviador.paraCorreo(persona.correo)[0] as never,
      );

      const respuesta = await verificar(c, deRecuperacion);

      expect(respuesta.status).toBe(400);
      expect(await correoVerificadoEn(persona.id)).toBeNull();
    });

    it('el cuerpo sin token, o con uno de largo imposible, es 400', async () => {
      const c = cliente();

      const sinToken = await c.post('/api/v1/auth/verificar-correo').send({});
      const corto = await verificar(c, 'corto');

      expect(sinToken.status).toBe(400);
      expect(corto.status).toBe(400);
    });

    it('los intentos fallidos quedan en la auditoría y el éxito también', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);
      await verificar(c, 'y'.repeat(43));
      await verificar(c, tokenDelUltimoEnlace(persona.correo));

      const exito = await filas<{ resultado: string }>(
        `select resultado from compartido.auditoria where accion = 'identidad.confirmar_correo' and actor_id = $1`,
        [persona.id],
      );
      expect(exito.map((f) => f.resultado)).toEqual(['permitido']);
      const denegados = await filas<{ resultado: string }>(
        `select resultado from compartido.auditoria
         where accion = 'identidad.confirmar_correo' and resultado = 'denegado'`,
      );
      expect(denegados.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Pedir otro enlace ───────────────────────────────────────────
  describe('POST /yo/correo/verificacion', () => {
    it('envía un enlace nuevo, y el anterior deja de servir (solo vale el último)', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);
      const primero = tokenDelUltimoEnlace(persona.correo);
      reloj.avanzar(2 * MINUTO);

      const respuesta = await pedirOtro(c, persona);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ resultado: 'enviado' });
      expect(enviador.verificacionesParaCorreo(persona.correo)).toHaveLength(2);
      expect((await verificar(c, primero)).status).toBe(400);
      const segundo = tokenDelUltimoEnlace(persona.correo);
      expect((await verificar(c, segundo)).status).toBe(204);
    });

    it('pedirlo de nuevo enseguida no manda otro correo (no sirve para llenar una bandeja)', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);

      const respuesta = await pedirOtro(c, persona);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ resultado: 'demasiado_pronto' });
      expect(enviador.verificacionesParaCorreo(persona.correo)).toHaveLength(1);
    });

    it('con el correo ya verificado no manda nada', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);
      await verificar(c, tokenDelUltimoEnlace(persona.correo));
      reloj.avanzar(5 * MINUTO);

      const respuesta = await pedirOtro(c, persona);

      expect(respuesta.body).toEqual({ resultado: 'ya_verificado' });
      expect(enviador.verificacionesParaCorreo(persona.correo)).toHaveLength(1);
    });

    it('si el canal falla, lo dice (para que la pantalla avise), sin romperse', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await esperarEnlace(persona.correo);
      reloj.avanzar(2 * MINUTO);
      enviador.falla = true;

      const respuesta = await pedirOtro(c, persona);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ resultado: 'fallo_de_envio' });
    });

    it('sin sesión es 401: cada quien pide solo el suyo, el id sale de la sesión', async () => {
      const respuesta = await cliente().post('/api/v1/yo/correo/verificacion');

      expect(respuesta.status).toBe(401);
    });
  });

  // ─── Cuentas suspendidas ─────────────────────────────────────────
  describe('una cuenta suspendida no entra', () => {
    const suspender = (usuarioId: string) =>
      bd.query(
        "update identidad.usuarios set estado = 'suspendido' where id = $1",
        [usuarioId],
      );

    it('no inicia sesión, aunque la contraseña sea correcta (y el mensaje es el mismo de siempre)', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await suspender(persona.id);

      const respuesta = await c
        .post('/api/v1/auth/login')
        .send({ correo: persona.correo, contrasena: CONTRASENA });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toMatchObject({
        codigo: 'auth.credenciales_invalidas',
      });
    });

    it('su perfil deja de responder con la sesión que tuviera abierta', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      expect((await perfil(c, persona)).status).toBe(200);
      await suspender(persona.id);

      expect((await perfil(c, persona)).status).toBe(401);
    });

    it('no puede renovar la sesión ni recuperar la contraseña', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await suspender(persona.id);

      const renovada = await c
        .post('/api/v1/auth/refresh')
        .set('Cookie', `seniory_refresco=${persona.sesion.refresco}`);
      await c
        .post('/api/v1/auth/olvide-contrasena')
        .send({ correo: persona.correo });

      expect(renovada.status).toBe(401);
      expect(enviador.paraCorreo(persona.correo)).toHaveLength(0);
    });

    it('al reactivarla (estado «activo») vuelve a entrar con la misma contraseña', async () => {
      const c = cliente();
      const persona = await registrarFamiliar(c);
      await suspender(persona.id);
      await bd.query(
        "update identidad.usuarios set estado = 'activo' where id = $1",
        [persona.id],
      );

      const respuesta = await c
        .post('/api/v1/auth/login')
        .send({ correo: persona.correo, contrasena: CONTRASENA });

      expect(respuesta.status).toBe(200);
    });

    it('la base solo admite los estados activo, suspendido y eliminado', async () => {
      const persona = await registrarFamiliar(cliente());

      await expect(
        bd.query(
          "update identidad.usuarios set estado = 'otro' where id = $1",
          [persona.id],
        ),
      ).rejects.toThrow(/usuarios_estado_valido/);
    });
  });

  it('un correo cualquiera sigue siendo único: registrarse con el de otra persona no da su cuenta', async () => {
    const c = cliente();
    const persona = await registrarFamiliar(c);

    const otra = await c.post('/api/v1/auth/registro').send({
      nombre: 'Otra Persona',
      correo: persona.correo,
      contrasena: CONTRASENA,
      versionPolitica: 'v1',
    });

    expect(otra.status).toBe(409);
    expect(correoNuevo()).not.toBe(persona.correo);
  });
});
