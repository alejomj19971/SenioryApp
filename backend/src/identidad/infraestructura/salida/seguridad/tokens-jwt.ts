import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { Reloj } from '../../../../compartido/aplicacion/puertos/reloj.js';
import type {
  UsuarioAutenticado,
  VerificadorDeTokens,
} from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { NoAutenticado } from '../../../../compartido/dominio/errores.js';
import { esRol, type Rol } from '../../../../compartido/dominio/rol.js';
import type {
  EmisorDeTokens,
  TokenDeAcceso,
} from '../../../aplicacion/puertos/salida/emisor-de-tokens.js';
import type { UsuarioId } from '../../../dominio/ids.js';

const ALGORITMO = 'HS256';
const EMISOR = 'seniory';
const AUDIENCIA = 'seniory-api';
// `at+jwt` (RFC 9068): impide confundir este token con otros JWT firmados con la misma clave.
const TIPO = 'at+jwt';

export interface OpcionesDeTokensJwt {
  secreto: string;
  idDeClave: string;
  duracionDelAccesoMs: number;
}

// Token de acceso: JWT firmado con HS256 que lleva el id y el rol, y dura pocos minutos. Es el
// emisor Y el verificador: comparten clave, reloj y formato, y es el guard global quien lo usa en cada
// petición (sin tocar la base de datos).
//
// Como no consulta la base, un token ya emitido sigue valiendo hasta que venza aunque se cierre la
// sesión o se cambie el rol: por eso dura 15 minutos y la renovación sí relee el rol y el estado de
// la cuenta.
export class TokensJwt implements EmisorDeTokens, VerificadorDeTokens {
  private readonly clave: Uint8Array;

  constructor(
    private readonly opciones: OpcionesDeTokensJwt,
    private readonly reloj: Reloj,
  ) {
    this.clave = new TextEncoder().encode(opciones.secreto);
  }

  async emitirAcceso(
    usuario: { id: UsuarioId; rol: Rol },
    ahora: Date,
  ): Promise<TokenDeAcceso> {
    const emitidoEn = Math.floor(ahora.getTime() / 1000);
    const expiraEn = new Date(
      ahora.getTime() + this.opciones.duracionDelAccesoMs,
    );
    const token = await new SignJWT({ rol: usuario.rol })
      .setProtectedHeader({
        alg: ALGORITMO,
        kid: this.opciones.idDeClave,
        typ: TIPO,
      })
      .setIssuer(EMISOR)
      .setAudience(AUDIENCIA)
      .setSubject(usuario.id)
      .setJti(randomUUID())
      .setIssuedAt(emitidoEn)
      .setExpirationTime(Math.floor(expiraEn.getTime() / 1000))
      .sign(this.clave);
    return { token, expiraEn };
  }

  // Cualquier problema (firma, vencimiento, clave desconocida, forma) es el mismo 401: el cliente
  // no necesita saber cuál fue.
  async verificar(token: string): Promise<UsuarioAutenticado> {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.clave, {
        algorithms: [ALGORITMO],
        issuer: EMISOR,
        audience: AUDIENCIA,
        typ: TIPO,
        requiredClaims: ['sub', 'exp', 'iat', 'jti'],
        currentDate: this.reloj.ahora(),
      });
      const { sub, rol } = payload;
      if (
        protectedHeader.kid !== this.opciones.idDeClave ||
        typeof sub !== 'string' ||
        sub === '' ||
        typeof rol !== 'string' ||
        !esRol(rol)
      ) {
        throw new Error('token con forma inesperada');
      }
      return { id: sub, rol };
    } catch {
      throw new NoAutenticado('Tu sesión expiró; inicia sesión de nuevo');
    }
  }
}
