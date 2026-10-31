import type { Consentimiento } from '../../../dominio/consentimiento.js';
import type { AdultoMayorId, ConsentimientoId } from '../../../dominio/ids.js';
import type { FinalidadDeConsentimiento } from '../../../dominio/valores-cerrados.js';

export interface RepositorioConsentimientos {
  // Lanza ConflictoDeEstado (`consentimiento.ya_vigente`) si ya hay uno vigente para la misma
  // persona y finalidad. El dominio ya lo comprueba; este es el respaldo cuando dos peticiones
  // simultáneas pasan la comprobación a la vez.
  guardar(consentimiento: Consentimiento): Promise<void>;

  // Guarda la revocación. Lanza RecursoNoEncontrado si no existe.
  actualizar(consentimiento: Consentimiento): Promise<void>;

  buscarPorId(id: ConsentimientoId): Promise<Consentimiento | null>;

  // Igual que `buscarPorId`, pero bloquea la fila hasta que termine la transacción: dos revocaciones
  // simultáneas se atienden una tras otra y la segunda ya ve que está revocado. Debe llamarse dentro
  // de una unidad de trabajo.
  buscarPorIdParaActualizar(
    id: ConsentimientoId,
  ): Promise<Consentimiento | null>;

  buscarVigente(
    adultoMayorId: AdultoMayorId,
    finalidad: FinalidadDeConsentimiento,
  ): Promise<Consentimiento | null>;

  // Los consentimientos vigentes de varias personas a la vez (para el perfil del familiar).
  listarVigentesDe(
    adultoMayorIds: readonly AdultoMayorId[],
    finalidad: FinalidadDeConsentimiento,
  ): Promise<Consentimiento[]>;
}

export const REPOSITORIO_CONSENTIMIENTOS = Symbol('RepositorioConsentimientos');
