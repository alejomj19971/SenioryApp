import type { AdultoMayor } from '../../../dominio/adulto-mayor.js';
import type { AdultoMayorId } from '../../../dominio/ids.js';

export interface RepositorioAdultosMayores {
  guardar(adultoMayor: AdultoMayor): Promise<void>;
  buscarPorId(id: AdultoMayorId): Promise<AdultoMayor | null>;
  // Devuelve solo los que existen, sin garantizar el orden.
  listarPorIds(ids: readonly AdultoMayorId[]): Promise<AdultoMayor[]>;
}

export const REPOSITORIO_ADULTOS_MAYORES = Symbol('RepositorioAdultosMayores');
