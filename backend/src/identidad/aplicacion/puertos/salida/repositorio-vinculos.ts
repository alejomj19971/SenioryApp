import type { AdultoMayorId, UsuarioId } from '../../../dominio/ids.js';
import type { Vinculo } from '../../../dominio/vinculo.js';

export interface RepositorioVinculos {
  // Lanza ConflictoDeEstado (`vinculo.ya_existe`) si ya hay un vínculo ACTIVO entre las dos personas.
  guardar(vinculo: Vinculo): Promise<void>;

  // Guarda la revocación del vínculo. Lanza RecursoNoEncontrado si no existe.
  actualizar(vinculo: Vinculo): Promise<void>;

  // El vínculo activo de este familiar con esta persona mayor, si lo hay.
  buscarActivo(
    familiarId: UsuarioId,
    adultoMayorId: AdultoMayorId,
  ): Promise<Vinculo | null>;

  listarActivosDeFamiliar(familiarId: UsuarioId): Promise<Vinculo[]>;
  // Los familiares vinculados a una persona mayor: a quién avisar de una alerta.
  listarActivosDeAdultoMayor(adultoMayorId: AdultoMayorId): Promise<Vinculo[]>;
}

export const REPOSITORIO_VINCULOS = Symbol('RepositorioVinculos');
