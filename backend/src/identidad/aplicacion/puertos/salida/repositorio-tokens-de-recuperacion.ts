import type { UsuarioId } from '../../../dominio/ids.js';
import type { TokenDeRecuperacion } from '../../../dominio/token-de-recuperacion.js';

export interface RepositorioTokensDeRecuperacion {
  guardar(token: TokenDeRecuperacion): Promise<void>;

  // Por el SHA-256 del token, sin bloqueo: para descartar rápido un enlace falso antes de gastar CPU
  // en calcular un hash.
  buscarPorHashDelToken(hash: Uint8Array): Promise<TokenDeRecuperacion | null>;

  // Igual, pero bloquea la fila hasta que termine la transacción: dos usos simultáneos del mismo enlace
  // se atienden uno tras otro y el segundo ya lo ve gastado. Debe llamarse dentro de una unidad de trabajo.
  buscarPorHashParaActualizar(
    hash: Uint8Array,
  ): Promise<TokenDeRecuperacion | null>;

  // Guarda que el token se usó. Nunca sobrescribe una marca que ya exista.
  actualizar(token: TokenDeRecuperacion): Promise<void>;

  // El enlace más reciente que se pidió para esa cuenta, usado o no.
  buscarUltimoDeUsuario(
    usuarioId: UsuarioId,
  ): Promise<TokenDeRecuperacion | null>;

  // Gasta todos los enlaces sin usar de la cuenta: al pedir uno nuevo, solo sirve el último.
  invalidarPendientesDeUsuario(
    usuarioId: UsuarioId,
    ahora: Date,
  ): Promise<number>;

  // Borra los que vencieron antes de `limite` (tarea diaria de limpieza). Devuelve cuántos.
  eliminarVencidosAntesDe(limite: Date): Promise<number>;
}

export const REPOSITORIO_TOKENS_DE_RECUPERACION = Symbol(
  'RepositorioTokensDeRecuperacion',
);
