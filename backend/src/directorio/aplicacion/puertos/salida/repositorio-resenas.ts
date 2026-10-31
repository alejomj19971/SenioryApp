import type { CuidadorId } from '../../../dominio/ids.js';
import type { Resena } from '../../../dominio/resena.js';

export interface RepositorioResenas {
  // Lanza ConflictoDeEstado (`resena.ya_existe`) si el servicio ya tiene su reseña: así el manejador del
  // evento es idempotente aunque dos entregas lleguen a la vez.
  guardar(resena: Resena): Promise<void>;

  existeParaServicio(servicioId: string): Promise<boolean>;

  // Las más recientes primero, sin las que un administrador ocultó.
  listarVisiblesDeCuidador(
    cuidadorId: CuidadorId,
    limite: number,
  ): Promise<Resena[]>;
}

export const REPOSITORIO_RESENAS = Symbol('RepositorioResenas');
