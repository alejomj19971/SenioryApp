import {
  ConflictoDeEstado,
  ReglaDeNegocioIncumplida,
} from '../../compartido/dominio/errores.js';
import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import type { Id } from '../../compartido/dominio/id.js';
import type { HoraDelDia, MedicamentoId } from './medicamento.js';

export type TomaId = Id<'Toma'>;

export const ESTADOS_DE_TOMA = ['pendiente', 'tomada', 'omitida'] as const;
export type EstadoDeToma = (typeof ESTADOS_DE_TOMA)[number];

export interface DatosDeToma {
  id: TomaId;
  medicamentoId: MedicamentoId;
  // Copia para consultar las tomas del día sin unir tablas.
  adultoMayorId: string;
  // El día civil en la zona del negocio (H6), nunca un instante UTC.
  fecha: FechaCivil;
  horaProgramada: HoraDelDia;
  estado: EstadoDeToma;
  registradaPor: string | null;
  registradaEn: Date | null;
  // Bloqueo optimista: marcar y desmarcar desde dos pantallas a la vez no se pisan.
  version: number;
  creadaEn: Date;
}

export interface DatosParaCrearToma {
  id: TomaId;
  medicamentoId: MedicamentoId;
  adultoMayorId: string;
  fecha: FechaCivil;
  horaProgramada: HoraDelDia;
  ahora: Date;
}

// Una dosis que hay que tomar: un medicamento, un día y una hora. Se genera sola cada día (idempotente: una por
// medicamento, día y hora).
//
//   pendiente ──marcar──▶ tomada ──desmarcar──▶ pendiente
//   pendiente ──(pasó la tolerancia)──▶ omitida ──marcar (tarde)──▶ tomada
//
// Solo se marca o desmarca EL DÍA que corresponde (H6): no se registra con retraso lo de ayer ni por adelantado lo
// de mañana.
export class Toma {
  private constructor(
    private datos: DatosDeToma,
    private readonly versionLeida: number,
  ) {}

  static crear(entrada: DatosParaCrearToma): Toma {
    return new Toma(
      {
        id: entrada.id,
        medicamentoId: entrada.medicamentoId,
        adultoMayorId: entrada.adultoMayorId,
        fecha: entrada.fecha,
        horaProgramada: entrada.horaProgramada,
        estado: 'pendiente',
        registradaPor: null,
        registradaEn: null,
        version: 1,
        creadaEn: entrada.ahora,
      },
      0,
    );
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeToma): Toma {
    return new Toma({ ...datos }, datos.version);
  }

  get id(): TomaId {
    return this.datos.id;
  }
  get medicamentoId(): MedicamentoId {
    return this.datos.medicamentoId;
  }
  get adultoMayorId(): string {
    return this.datos.adultoMayorId;
  }
  get fecha(): FechaCivil {
    return this.datos.fecha;
  }
  get horaProgramada(): HoraDelDia {
    return this.datos.horaProgramada;
  }
  get estado(): EstadoDeToma {
    return this.datos.estado;
  }
  get registradaPor(): string | null {
    return this.datos.registradaPor;
  }
  get registradaEn(): Date | null {
    return this.datos.registradaEn;
  }
  get version(): number {
    return this.datos.version;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  // La versión con la que se leyó de la base (0 si es nueva): con ella el repositorio detecta que otra persona la
  // cambió en el medio.
  get versionLeidaDeLaBase(): number {
    return this.versionLeida;
  }

  // La persona (o su cuidador) dice que ya la tomó. También sirve para registrar una omitida que sí se tomó,
  // tarde pero el mismo día.
  marcarTomada(usuarioId: string, ahora: Date, hoy: FechaCivil): void {
    this.exigirElDia(hoy);
    if (this.datos.estado === 'tomada') {
      throw new ConflictoDeEstado(
        'Esa toma ya está registrada',
        'toma.ya_tomada',
      );
    }
    this.datos.estado = 'tomada';
    this.datos.registradaPor = usuarioId;
    this.datos.registradaEn = ahora;
    this.datos.version += 1;
  }

  // Se marcó por error: vuelve a pendiente. Queda en la auditoría quién lo deshizo.
  desmarcar(hoy: FechaCivil): void {
    this.exigirElDia(hoy);
    if (this.datos.estado !== 'tomada') {
      throw new ConflictoDeEstado(
        'Solo se puede deshacer una toma registrada',
        'toma.no_esta_tomada',
      );
    }
    this.datos.estado = 'pendiente';
    this.datos.registradaPor = null;
    this.datos.registradaEn = null;
    this.datos.version += 1;
  }

  // Pasó la tolerancia sin registrarse. Lo hace el sistema.
  omitir(): void {
    if (this.datos.estado !== 'pendiente') {
      throw new ConflictoDeEstado(
        `Una toma ${this.datos.estado} no se puede omitir`,
        'toma.no_pendiente',
      );
    }
    this.datos.estado = 'omitida';
    this.datos.version += 1;
  }

  private exigirElDia(hoy: FechaCivil): void {
    if (!this.datos.fecha.igualA(hoy)) {
      throw new ReglaDeNegocioIncumplida(
        'Solo se puede registrar o deshacer una toma el día que corresponde',
        'toma.fuera_de_dia',
      );
    }
  }
}
