import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Cuidador } from '../../../dominio/cuidador.js';
import type {
  CursorDeCuidadores,
  FiltrosDeCuidadores,
} from '../../../dominio/filtros-de-cuidadores.js';
import type { CuidadorId } from '../../../dominio/ids.js';

export interface PaginaDeCuidadores {
  cuidadores: Cuidador[];
  // Desde dónde seguir; null si ya no hay más.
  siguiente: CursorDeCuidadores | null;
}

export interface FiltrosDisponibles {
  // Las zonas de los cuidadores visibles, sin repetir (una sola forma de escribir cada una).
  zonas: string[];
  // La tarifa por hora más alta entre los visibles; null si no hay ninguno.
  tarifaMaxima: number | null;
}

export interface RepositorioCuidadores {
  // Guarda un cuidador nuevo con sus verificaciones, todo o nada. Lanza ConflictoDeEstado si ya hay un
  // cuidador para esa cuenta (`cuidador.usuario_ya_tiene_perfil`).
  guardar(cuidador: Cuidador): Promise<void>;

  // Guarda lo que cambia después de creado: estado, visibilidad, contadores y versión. Lanza
  // RecursoNoEncontrado si no existe. Debe usarse con un cuidador leído con `buscarPorIdParaActualizar`.
  actualizar(cuidador: Cuidador): Promise<void>;

  buscarPorId(id: CuidadorId): Promise<Cuidador | null>;

  // El cuidador de esta cuenta de `identidad`, o null.
  buscarPorUsuarioId(usuarioId: string): Promise<Cuidador | null>;

  // Igual, pero bloquea la fila hasta que termine la transacción: dos reseñas simultáneas se atienden
  // una tras otra y no pisan los contadores. Debe llamarse dentro de una unidad de trabajo.
  buscarPorIdParaActualizar(id: CuidadorId): Promise<Cuidador | null>;

  // SOLO los visibles, ordenados por mejor calificación, menor tarifa y id; paginados por cursor.
  listarVisibles(
    filtros: FiltrosDeCuidadores,
    limite: number,
    cursor: CursorDeCuidadores | null,
  ): Promise<PaginaDeCuidadores>;

  obtenerFiltrosDisponibles(): Promise<FiltrosDisponibles>;

  // Los que hoy figuran como visibles pero ya no tienen los tres controles aprobados y vigentes (se les
  // venció uno). La revisión diaria los oculta.
  listarIdsVisiblesConControlVencido(hoy: FechaCivil): Promise<CuidadorId[]>;
}

export const REPOSITORIO_CUIDADORES = Symbol('RepositorioCuidadores');
