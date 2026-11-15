import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { CifradorDeSecretos } from '../../../aplicacion/puertos/salida/cifrador-de-secretos.js';

const ALGORITMO = 'aes-256-gcm';
const BYTES_DEL_VECTOR_DE_INICIO = 12;
const BYTES_DE_LA_ETIQUETA = 16;

// AES-256-GCM: cada cifrado usa un vector de inicio (IV) nuevo y al azar, y la etiqueta de autenticación
// detecta cualquier manipulación del texto cifrado (o una llave distinta) al descifrar. Se guardan juntos,
// en este orden, como un solo bloque: IV (12 bytes) + etiqueta (16 bytes) + texto cifrado.
//
// SECRETO_DE_CIFRADO puede ser cualquier texto largo (igual que los demás secretos del proyecto): se
// reduce a los 32 bytes exactos que pide AES-256 con SHA-256, en vez de exigir que venga ya en hexadecimal.
export class CifradorDeSecretosAes implements CifradorDeSecretos {
  private readonly llave: Buffer;

  constructor(secreto: string) {
    this.llave = createHash('sha256').update(secreto, 'utf8').digest();
  }

  cifrar(textoPlano: string): Uint8Array {
    const iv = randomBytes(BYTES_DEL_VECTOR_DE_INICIO);
    const cifrador = createCipheriv(ALGORITMO, this.llave, iv);
    const cuerpo = Buffer.concat([
      cifrador.update(textoPlano, 'utf8'),
      cifrador.final(),
    ]);
    return Buffer.concat([iv, cifrador.getAuthTag(), cuerpo]);
  }

  descifrar(cifrado: Uint8Array): string {
    const buffer = Buffer.from(cifrado);
    const minimo = BYTES_DEL_VECTOR_DE_INICIO + BYTES_DE_LA_ETIQUETA;
    if (buffer.byteLength < minimo) {
      throw new Error('El secreto cifrado no tiene un formato válido');
    }
    const iv = buffer.subarray(0, BYTES_DEL_VECTOR_DE_INICIO);
    const etiqueta = buffer.subarray(
      BYTES_DEL_VECTOR_DE_INICIO,
      minimo,
    );
    const cuerpo = buffer.subarray(minimo);
    const descifrador = createDecipheriv(ALGORITMO, this.llave, iv);
    descifrador.setAuthTag(etiqueta);
    // Si la llave no es la misma, o el dato fue manipulado, `final()` lanza (la etiqueta no valida).
    return Buffer.concat([
      descifrador.update(cuerpo),
      descifrador.final(),
    ]).toString('utf8');
  }
}
