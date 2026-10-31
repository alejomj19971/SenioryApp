import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Alerta, AlertaId } from '../../../dominio/alerta.js';
import type {
  Medicamento,
  MedicamentoId,
} from '../../../dominio/medicamento.js';
import type {
  LecturaDeSignos,
  RangosDeReferencia,
} from '../../../dominio/signos.js';
import type { Toma, TomaId } from '../../../dominio/toma.js';

// Los puertos de salida de Teleasistencia. Guardan datos de salud: solo se llaman desde casos de uso que ya
// pasaron por la política de acceso.

export interface RepositorioMedicamentos {
  guardar(medicamento: Medicamento): Promise<void>;

  // Guarda lo que cambia después de creado: hoy, dejar de tomarlo.
  actualizar(medicamento: Medicamento): Promise<void>;

  buscarPorId(id: MedicamentoId): Promise<Medicamento | null>;

  // Los que se siguen tomando (activos), con sus horarios.
  listarActivos(adultoMayorId: string): Promise<Medicamento[]>;
}
export const REPOSITORIO_MEDICAMENTOS = Symbol('RepositorioMedicamentos');

export interface RepositorioTomas {
  // Crea las tomas que faltan de ese medicamento para ese día (una por horario). Es idempotente: las que ya
  // existen se dejan como están, aunque dos peticiones lo hagan a la vez.
  generarDelDia(medicamento: Medicamento, fecha: FechaCivil): Promise<void>;

  listarDelDia(adultoMayorId: string, fecha: FechaCivil): Promise<Toma[]>;

  buscarPorId(id: TomaId): Promise<Toma | null>;

  // Igual, pero bloquea la fila hasta que termine la transacción.
  buscarPorIdParaActualizar(id: TomaId): Promise<Toma | null>;

  // Guarda el cambio con bloqueo optimista: si otra persona la cambió en el medio, lanza ConflictoDeEstado
  // (`toma.modificada`).
  actualizar(toma: Toma): Promise<void>;

  // Las pendientes cuya hora programada más la tolerancia ya pasó (para la tarea que las marca omitidas).
  listarVencidas(
    limiteInstante: Date,
    zona: string,
    limite: number,
  ): Promise<TomaId[]>;
}
export const REPOSITORIO_TOMAS = Symbol('RepositorioTomas');

export interface RepositorioLecturas {
  guardar(lectura: LecturaDeSignos): Promise<void>;

  // Desde `desde`, las más recientes primero.
  listarDesde(adultoMayorId: string, desde: Date): Promise<LecturaDeSignos[]>;

  ultima(adultoMayorId: string): Promise<LecturaDeSignos | null>;
}
export const REPOSITORIO_LECTURAS = Symbol('RepositorioLecturas');

export interface RepositorioRangos {
  // Null si la persona no tiene rangos propios (se usan los generales).
  obtener(adultoMayorId: string): Promise<RangosDeReferencia | null>;

  guardar(
    adultoMayorId: string,
    rangos: RangosDeReferencia,
    definidosPor: string,
    ahora: Date,
  ): Promise<void>;
}
export const REPOSITORIO_RANGOS = Symbol('RepositorioRangos');

export interface RepositorioAlertas {
  // Lanza ConflictoDeEstado (`alerta.clave_repetida`) si esa persona ya usó esa clave. Tras el error la
  // transacción en curso queda abortada.
  guardar(alerta: Alerta): Promise<void>;

  actualizar(alerta: Alerta): Promise<void>;

  buscarPorId(id: AlertaId): Promise<Alerta | null>;

  buscarPorIdParaActualizar(id: AlertaId): Promise<Alerta | null>;

  // Para que un reintento con la misma clave devuelva la misma alerta.
  buscarPorClave(
    generadaPor: string,
    claveDeIdempotencia: string,
  ): Promise<Alerta | null>;

  // Cuántas siguen sin atender (para el resumen).
  contarAbiertas(adultoMayorId: string): Promise<number>;
}
export const REPOSITORIO_ALERTAS = Symbol('RepositorioAlertas');
