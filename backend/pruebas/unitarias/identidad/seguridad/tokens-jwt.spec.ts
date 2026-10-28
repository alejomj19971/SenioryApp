import { SignJWT } from 'jose';
import { NoAutenticado } from '../../../../src/compartido/dominio/errores.js';
import type { UsuarioId } from '../../../../src/identidad/dominio/ids.js';
import {
  TokensJwt,
  type OpcionesDeTokensJwt,
} from '../../../../src/identidad/infraestructura/salida/seguridad/tokens-jwt.js';
import { RelojFalso } from '../../../soporte/dobles.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const SECRETO = 'secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres';
const QUINCE_MINUTOS = 15 * 60_000;

function crear(
  cambios: Partial<OpcionesDeTokensJwt> = {},
  reloj = new RelojFalso(),
) {
  return {
    reloj,
    tokens: new TokensJwt(
      {
        secreto: SECRETO,
        idDeClave: 'k1',
        duracionDelAccesoMs: QUINCE_MINUTOS,
        ...cambios,
      },
      reloj,
    ),
  };
}

const usuario = (rol: 'familiar' | 'administrador' = 'familiar') => ({
  id: idDePrueba<'Usuario'>() as UsuarioId,
  rol,
});

function partes(token: string) {
  const [cabecera, carga, firma] = token.split('.') as [string, string, string];
  const decodificar = (texto: string) =>
    JSON.parse(Buffer.from(texto, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  return {
    cabecera: decodificar(cabecera),
    carga: decodificar(carga),
    firma,
    crudos: { cabecera, carga },
  };
}

describe('TokensJwt', () => {
  describe('emitir', () => {
    it('lleva el id, el rol, el emisor, la audiencia y un jti, y dura lo configurado', async () => {
      const { tokens, reloj } = crear();
      const persona = usuario('administrador');

      const { token, expiraEn } = await tokens.emitirAcceso(
        persona,
        reloj.ahora(),
      );
      const { cabecera, carga } = partes(token);

      expect(cabecera).toEqual({ alg: 'HS256', kid: 'k1', typ: 'at+jwt' });
      expect(carga).toMatchObject({
        sub: persona.id,
        rol: 'administrador',
        iss: 'seniory',
        aud: 'seniory-api',
      });
      expect(carga.jti).toEqual(expect.any(String));
      expect(carga.exp).toBe(Math.floor(expiraEn.getTime() / 1000));
      expect(expiraEn.getTime() - reloj.ahora().getTime()).toBe(QUINCE_MINUTOS);
    });

    it('no lleva correo, nombre ni teléfono', async () => {
      const { tokens, reloj } = crear();

      const { token } = await tokens.emitirAcceso(usuario(), reloj.ahora());

      expect(Object.keys(partes(token).carga).sort()).toEqual(
        ['aud', 'exp', 'iat', 'iss', 'jti', 'rol', 'sub'].sort(),
      );
    });

    it('cada token tiene un jti distinto', async () => {
      const { tokens, reloj } = crear();
      const persona = usuario();

      const a = await tokens.emitirAcceso(persona, reloj.ahora());
      const b = await tokens.emitirAcceso(persona, reloj.ahora());

      expect(partes(a.token).carga.jti).not.toBe(partes(b.token).carga.jti);
    });
  });

  describe('verificar', () => {
    it('devuelve el id y el rol de un token válido', async () => {
      const { tokens, reloj } = crear();
      const persona = usuario('administrador');
      const { token } = await tokens.emitirAcceso(persona, reloj.ahora());

      expect(await tokens.verificar(token)).toEqual(persona);
    });

    it('sigue valiendo hasta el último segundo y deja de valer al vencer', async () => {
      const { tokens, reloj } = crear();
      const { token } = await tokens.emitirAcceso(usuario(), reloj.ahora());

      reloj.avanzar(QUINCE_MINUTOS - 1_000);
      await expect(tokens.verificar(token)).resolves.toBeDefined();

      reloj.avanzar(1_000);
      await expect(tokens.verificar(token)).rejects.toBeInstanceOf(
        NoAutenticado,
      );
    });

    it('rechaza un token firmado con otro secreto', async () => {
      const { tokens, reloj } = crear();
      const ajeno = crear({ secreto: 'x'.repeat(40) }).tokens;
      const { token } = await ajeno.emitirAcceso(usuario(), reloj.ahora());

      await expect(tokens.verificar(token)).rejects.toBeInstanceOf(
        NoAutenticado,
      );
    });

    it('rechaza un token con otro identificador de clave (kid)', async () => {
      const { tokens, reloj } = crear();
      const deOtraClave = crear({ idDeClave: 'k2' }).tokens;
      const { token } = await deOtraClave.emitirAcceso(
        usuario(),
        reloj.ahora(),
      );

      await expect(tokens.verificar(token)).rejects.toBeInstanceOf(
        NoAutenticado,
      );
    });

    it('rechaza un token al que se le cambió el rol, aunque conserve la firma original', async () => {
      const { tokens, reloj } = crear();
      const { token } = await tokens.emitirAcceso(
        usuario('familiar'),
        reloj.ahora(),
      );
      const { crudos, carga, firma } = partes(token);
      const adulterada = Buffer.from(
        JSON.stringify({ ...carga, rol: 'administrador' }),
      ).toString('base64url');

      await expect(
        tokens.verificar(`${crudos.cabecera}.${adulterada}.${firma}`),
      ).rejects.toBeInstanceOf(NoAutenticado);
    });

    it('rechaza un token sin firma (alg: none)', async () => {
      const { tokens, reloj } = crear();
      const { token } = await tokens.emitirAcceso(usuario(), reloj.ahora());
      const { carga } = partes(token);
      const cabecera = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'at+jwt', kid: 'k1' }),
      ).toString('base64url');
      const cuerpo = Buffer.from(JSON.stringify(carga)).toString('base64url');

      await expect(
        tokens.verificar(`${cabecera}.${cuerpo}.`),
      ).rejects.toBeInstanceOf(NoAutenticado);
    });

    it('rechaza otro algoritmo de firma, aunque use la misma clave (HS512)', async () => {
      const { tokens, reloj } = crear();
      const token = await new SignJWT({ rol: 'familiar' })
        .setProtectedHeader({ alg: 'HS512', kid: 'k1', typ: 'at+jwt' })
        .setIssuer('seniory')
        .setAudience('seniory-api')
        .setSubject(usuario().id)
        .setJti('x')
        .setIssuedAt(Math.floor(reloj.ahora().getTime() / 1000))
        .setExpirationTime(Math.floor(reloj.ahora().getTime() / 1000) + 600)
        .sign(new TextEncoder().encode(SECRETO));

      await expect(tokens.verificar(token)).rejects.toBeInstanceOf(
        NoAutenticado,
      );
    });

    // Un JWT firmado con la clave correcta pero que no es un token de acceso de Seniory.
    async function firmado(
      cambios: (jwt: SignJWT) => SignJWT,
      cabecera: Record<string, string> = {
        alg: 'HS256',
        kid: 'k1',
        typ: 'at+jwt',
      },
    ): Promise<string> {
      const ahora = Math.floor(new RelojFalso().ahora().getTime() / 1000);
      const base = new SignJWT({ rol: 'familiar' })
        .setProtectedHeader(cabecera as { alg: string })
        .setIssuer('seniory')
        .setAudience('seniory-api')
        .setSubject(usuario().id)
        .setJti('x')
        .setIssuedAt(ahora)
        .setExpirationTime(ahora + 600);
      return cambios(base).sign(new TextEncoder().encode(SECRETO));
    }

    it.each([
      ['otro emisor', (jwt: SignJWT) => jwt.setIssuer('otro')],
      ['otra audiencia', (jwt: SignJWT) => jwt.setAudience('otra')],
      ['sin sujeto', (jwt: SignJWT) => jwt.setSubject('')],
    ])('rechaza un token con %s', async (_caso, cambio) => {
      const { tokens } = crear();

      await expect(
        tokens.verificar(await firmado(cambio)),
      ).rejects.toBeInstanceOf(NoAutenticado);
    });

    it('rechaza un token de otro tipo (typ distinto de at+jwt)', async () => {
      const { tokens } = crear();
      const token = await firmado((jwt) => jwt, {
        alg: 'HS256',
        kid: 'k1',
        typ: 'JWT',
      });

      await expect(tokens.verificar(token)).rejects.toBeInstanceOf(
        NoAutenticado,
      );
    });

    it('rechaza un rol que no existe', async () => {
      const { tokens } = crear();
      const ahora = Math.floor(new RelojFalso().ahora().getTime() / 1000);
      const token = await new SignJWT({ rol: 'superusuario' })
        .setProtectedHeader({ alg: 'HS256', kid: 'k1', typ: 'at+jwt' })
        .setIssuer('seniory')
        .setAudience('seniory-api')
        .setSubject(usuario().id)
        .setJti('x')
        .setIssuedAt(ahora)
        .setExpirationTime(ahora + 600)
        .sign(new TextEncoder().encode(SECRETO));

      await expect(tokens.verificar(token)).rejects.toBeInstanceOf(
        NoAutenticado,
      );
    });

    it.each(['', 'basura', 'a.b.c', 'a.b', '....'])(
      'rechaza el texto «%s»',
      async (texto) => {
        await expect(crear().tokens.verificar(texto)).rejects.toBeInstanceOf(
          NoAutenticado,
        );
      },
    );

    it('el error nunca revela la causa (firma, vencimiento, forma)', async () => {
      const { tokens, reloj } = crear();
      const { token } = await tokens.emitirAcceso(usuario(), reloj.ahora());
      reloj.avanzar(QUINCE_MINUTOS * 2);

      const vencido = await tokens.verificar(token).catch((e: unknown) => e);
      const basura = await tokens.verificar('basura').catch((e: unknown) => e);

      expect((vencido as Error).message).toBe((basura as Error).message);
      expect((vencido as NoAutenticado).codigo).toBe('no_autenticado');
    });
  });
});
