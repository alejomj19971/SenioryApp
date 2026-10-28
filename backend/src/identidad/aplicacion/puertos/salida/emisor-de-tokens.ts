import type { Rol } from '../../../../compartido/dominio/rol.js';
import type { UsuarioId } from '../../../dominio/ids.js';

export interface TokenDeAcceso {
  token: string;
  expiraEn: Date;
}

// Emite el token de acceso: corto (minutos), firmado, con el id y el rol. Lo verifica el
// `VerificadorDeTokens` de compartido, que usa el guard global.
export interface EmisorDeTokens {
  emitirAcceso(
    usuario: { id: UsuarioId; rol: Rol },
    ahora: Date,
  ): Promise<TokenDeAcceso>;
}

export const EMISOR_DE_TOKENS = Symbol('EmisorDeTokens');
