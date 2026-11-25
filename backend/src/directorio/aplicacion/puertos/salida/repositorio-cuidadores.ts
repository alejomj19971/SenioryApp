import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Cuidador } from '../../../dominio/cuidador.js';
import type {
  CursorDeCuidadores,
  FiltrosDeCuidadores,
} from '../../../dominio/filtros-de-cuidadores.js';
import type { CuidadorId, VerificacionId } from '../../../dominio/ids.js';
import type {
  Especialidad,
  EstadoDeCuidador,
  EstadoDeVerificacion,
} from '../../../dominio/valores-cerrados.js';
import type { Verificacion } from '../../../dominio/verificacion.js';

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

// Conteos para el panel del administrador: ningún dato de ninguna persona.
export interface EstadisticasDeCuidadores {
  total: number;
  porEstado: Record<EstadoDeCuidador, number>;
  // Los que hoy aparecen en el directorio (activos con los tres controles vigentes).
  visibles: number;
  // De los visibles, cuántos hay por especialidad.
  visiblesPorEspecialidad: Record<Especialidad, number>;
  // Verificaciones que esperan decisión de un revisor.
  verificacionesPendientes: number;
  // Promedio de todas las reseñas; null si todavía no hay ninguna.
  calificacionPromedio: number | null;
  totalDeResenas: number;
  serviciosCompletados: number;
}

// Un cuidador en el listado del administrador: de cualquier estado, y solo lo que hace falta para reconocerlo de un
// vistazo (nunca el teléfono ni los documentos).
export interface FilaDeCuidadorParaAdministrador {
  id: CuidadorId;
  nombre: string;
  fotoUrl: string | null;
  especialidad: Especialidad;
  zona: string;
  estado: EstadoDeCuidador;
  // Si hoy aparece en el directorio de las familias.
  visible: boolean;
  // Promedio con un decimal; null si todavía no tiene reseñas.
  calificacion: number | null;
  cantidadResenas: number;
  serviciosCompletados: number;
}

export interface FiltroParaAdministrador {
  // Texto ya normalizado (minúsculas, sin tildes): se busca en el nombre y en la zona.
  busqueda?: string;
  estado?: EstadoDeCuidador;
}

// Una verificación de la cola de los revisores, con quién la pidió (solo lo que el revisor necesita ver).
export interface FilaDeVerificacion {
  verificacion: Verificacion;
  cuidador: {
    id: CuidadorId;
    nombre: string;
    especialidad: Especialidad;
    zona: string;
  };
}

export interface RepositorioCuidadores {
  // Guarda un cuidador nuevo con sus verificaciones, todo o nada. Lanza ConflictoDeEstado si ya hay un
  // cuidador para esa cuenta (`cuidador.usuario_ya_tiene_perfil`).
  guardar(cuidador: Cuidador): Promise<void>;

  // Guarda lo que cambia después de creado: estado, visibilidad, contadores y versión. Lanza
  // RecursoNoEncontrado si no existe. Debe usarse con un cuidador leído con `buscarPorIdParaActualizar`.
  actualizar(cuidador: Cuidador): Promise<void>;

  // Guarda una verificación nueva o los cambios de una existente (aprobada, rechazada, vencida). Lanza
  // ConflictoDeEstado `verificacion.ya_vigente` si ese cuidador ya tiene una pendiente o aprobada de ese control.
  guardarVerificacion(verificacion: Verificacion): Promise<void>;

  // De quién es esa verificación, para bloquear a ese cuidador antes de decidir sobre ella.
  buscarCuidadorDeVerificacion(id: VerificacionId): Promise<CuidadorId | null>;

  // La cola de los revisores: las verificaciones en ese estado, las más antiguas primero.
  listarVerificaciones(
    estado: EstadoDeVerificacion,
    limite: number,
  ): Promise<FilaDeVerificacion[]>;

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

  // El listado del administrador: cualquier estado, por nombre. Se pide con un registro de más para saber si hay más
  // que los mostrados.
  listarParaAdministracion(
    filtro: FiltroParaAdministrador,
    limite: number,
  ): Promise<FilaDeCuidadorParaAdministrador[]>;

  // Los conteos del panel del administrador, calculados en la base (no se traen los cuidadores).
  obtenerEstadisticas(): Promise<EstadisticasDeCuidadores>;

  // Los que hoy figuran como visibles pero ya no tienen los tres controles aprobados y vigentes (se les
  // venció uno). La revisión diaria los oculta.
  listarIdsVisiblesConControlVencido(hoy: FechaCivil): Promise<CuidadorId[]>;
}

export const REPOSITORIO_CUIDADORES = Symbol('RepositorioCuidadores');
