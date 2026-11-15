import type { UsuarioId } from '../../../dominio/ids.js';
import type { DesafioDeSegundoFactor } from '../../../dominio/desafio-de-segundo-factor.js';

export interface RepositorioDesafiosDeSegundoFactor {
  guardar(desafio: DesafioDeSegundoFactor): Promise<void>;

  // Con bloqueo: dos usos simultáneos del mismo desafío se atienden uno tras otro. Debe llamarse dentro
  // de una unidad de trabajo.
  buscarPorHashParaActualizar(
    hash: Uint8Array,
  ): Promise<DesafioDeSegundoFactor | null>;

  actualizar(desafio: DesafioDeSegundoFactor): Promise<void>;

  // Gasta los desafíos sin usar de la cuenta (por ejemplo, al desactivar el segundo factor).
  invalidarPendientesDeUsuario(
    usuarioId: UsuarioId,
    ahora: Date,
  ): Promise<number>;

  // Borra los que vencieron antes de `limite` (tarea diaria de limpieza, igual que los enlaces de
  // recuperación). Devuelve cuántos.
  eliminarVencidosAntesDe(limite: Date): Promise<number>;
}

export const REPOSITORIO_DESAFIOS_DE_SEGUNDO_FACTOR = Symbol(
  'RepositorioDesafiosDeSegundoFactor',
);
