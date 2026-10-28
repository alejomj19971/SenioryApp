import { randomBytes } from 'node:crypto';
import { hash, verify, type Algorithm } from '@node-rs/argon2';
import type { HashDeContrasenas } from '../../../aplicacion/puertos/salida/hash-de-contrasenas.js';
import type { Contrasena } from '../../../dominio/contrasena.js';

// Argon2id con los parámetros mínimos que recomienda OWASP (19 MiB, 2 iteraciones, 1 hilo). El valor
// numérico es el del enum `Algorithm.Argon2id`: es un `const enum` y con `isolatedModules` no se puede
// importar como valor.
const OPCIONES = {
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export class HashDeContrasenasArgon2 implements HashDeContrasenas {
  // Hash de una contraseña al azar, calculado una sola vez, contra el que se verifica cuando no hay
  // cuenta (ver `simularVerificacion`).
  private hashFicticio: Promise<string> | undefined;

  calcular(contrasena: Contrasena): Promise<string> {
    return hash(contrasena.revelar(), OPCIONES);
  }

  async verificar(
    hashGuardado: string,
    contrasena: Contrasena,
  ): Promise<boolean> {
    try {
      return await verify(hashGuardado, contrasena.revelar());
    } catch {
      // Un hash ilegible no es una contraseña correcta; tampoco debe tumbar el inicio de sesión.
      return false;
    }
  }

  async simularVerificacion(contrasena: Contrasena): Promise<void> {
    this.hashFicticio ??= hash(randomBytes(24).toString('base64'), OPCIONES);
    await this.verificar(await this.hashFicticio, contrasena);
  }
}
