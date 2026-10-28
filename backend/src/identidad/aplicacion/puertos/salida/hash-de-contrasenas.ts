import type { Contrasena } from '../../../dominio/contrasena.js';

// Calcula y verifica el hash de las contraseñas (argon2id). Es costoso a propósito: cada llamada
// tarda decenas de milisegundos y usa memoria, para que adivinar contraseñas con un hash robado sea
// carísimo.
export interface HashDeContrasenas {
  // Hash en formato PHC (`$argon2id$…`), que ya incluye la sal y los parámetros.
  calcular(contrasena: Contrasena): Promise<string>;

  // Falso si no coincide o si el hash guardado no se puede leer. Nunca lanza por una contraseña errónea.
  verificar(hash: string, contrasena: Contrasena): Promise<boolean>;

  // Gasta el mismo tiempo que `verificar` sin que haya hash real. Se usa cuando el correo no existe:
  // si respondiera al instante, medir el tiempo revelaría qué correos tienen cuenta.
  simularVerificacion(contrasena: Contrasena): Promise<void>;
}

export const HASH_DE_CONTRASENAS = Symbol('HashDeContrasenas');
