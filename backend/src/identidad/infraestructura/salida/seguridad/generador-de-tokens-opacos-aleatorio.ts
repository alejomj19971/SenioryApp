import { createHash, randomBytes } from 'node:crypto';
import type {
  GeneradorDeTokensOpacos,
  TokenOpaco,
} from '../../../aplicacion/puertos/salida/generador-de-tokens-opacos.js';

const BYTES_DEL_TOKEN = 32; // 256 bits de azar

export class GeneradorDeTokensOpacosAleatorio implements GeneradorDeTokensOpacos {
  generar(): TokenOpaco {
    const token = randomBytes(BYTES_DEL_TOKEN).toString('base64url');
    return { token, hash: this.hashDe(token) };
  }

  hashDe(token: string): Uint8Array {
    return new Uint8Array(createHash('sha256').update(token).digest());
  }
}
