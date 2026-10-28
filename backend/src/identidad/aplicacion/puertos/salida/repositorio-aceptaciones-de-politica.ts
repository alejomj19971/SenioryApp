import type { AceptacionDePolitica } from '../../../dominio/aceptacion-de-politica.js';
import type { UsuarioId } from '../../../dominio/ids.js';

export interface RepositorioAceptacionesDePolitica {
  // Es idempotente: si la persona ya aceptó esa versión se conserva la primera aceptación, que es la
  // que sirve de prueba.
  guardar(aceptacion: AceptacionDePolitica): Promise<void>;
  listarDeUsuario(usuarioId: UsuarioId): Promise<AceptacionDePolitica[]>;
}

export const REPOSITORIO_ACEPTACIONES_DE_POLITICA = Symbol(
  'RepositorioAceptacionesDePolitica',
);
