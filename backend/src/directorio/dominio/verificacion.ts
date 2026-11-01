import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { CuidadorId, VerificacionId } from './ids.js';
import type {
  ControlDeVerificacion,
  EstadoDeVerificacion,
} from './valores-cerrados.js';

export interface DatosDeVerificacion {
  id: VerificacionId;
  cuidadorId: CuidadorId;
  control: ControlDeVerificacion;
  estado: EstadoDeVerificacion;
  // El administrador (en `identidad`) que la revisó.
  revisadoPor: string | null;
  revisadoEn: Date | null;
  motivoDeRechazo: string | null;
  // Hasta cuándo vale (los antecedentes caducan); null si no vence.
  vigenteHasta: FechaCivil | null;
  creadoEn: Date;
}

export interface DatosParaAprobarFueraDeLinea {
  id: VerificacionId;
  cuidadorId: CuidadorId;
  control: ControlDeVerificacion;
  revisadoPor: string;
  ahora: Date;
  vigenteHasta: FechaCivil | null;
}

// Uno de los tres controles que se le hacen a un cuidador antes de mostrarlo a las familias:
// antecedentes, títulos y prueba psicotécnica (E7). Un control aprobado deja de valer cuando pasa su
// fecha de vigencia: el perfil se oculta solo.
export class Verificacion {
  private constructor(private readonly datos: DatosDeVerificacion) {}

  // Un control que un administrador revisó fuera del sistema (la carga inicial de cuidadores reales):
  // entra ya aprobado, con quién lo revisó y hasta cuándo vale.
  static aprobadaFueraDeLinea(
    datos: DatosParaAprobarFueraDeLinea,
  ): Verificacion {
    if (datos.revisadoPor.trim() === '') {
      throw new ErrorDeValidacion(
        'Una verificación aprobada debe decir quién la revisó',
        'verificacion.sin_revisor',
      );
    }
    return new Verificacion({
      id: datos.id,
      cuidadorId: datos.cuidadorId,
      control: datos.control,
      estado: 'aprobada',
      revisadoPor: datos.revisadoPor,
      revisadoEn: datos.ahora,
      motivoDeRechazo: null,
      vigenteHasta: datos.vigenteHasta,
      creadoEn: datos.ahora,
    });
  }

  // El cuidador pide que revisen un control. Queda en la cola de los revisores.
  static solicitar(datos: {
    id: VerificacionId;
    cuidadorId: CuidadorId;
    control: ControlDeVerificacion;
    ahora: Date;
  }): Verificacion {
    return new Verificacion({
      id: datos.id,
      cuidadorId: datos.cuidadorId,
      control: datos.control,
      estado: 'pendiente',
      revisadoPor: null,
      revisadoEn: null,
      motivoDeRechazo: null,
      vigenteHasta: null,
      creadoEn: datos.ahora,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeVerificacion): Verificacion {
    return new Verificacion({ ...datos });
  }

  get id(): VerificacionId {
    return this.datos.id;
  }
  get cuidadorId(): CuidadorId {
    return this.datos.cuidadorId;
  }
  get control(): ControlDeVerificacion {
    return this.datos.control;
  }
  get estado(): EstadoDeVerificacion {
    return this.datos.estado;
  }
  get revisadoPor(): string | null {
    return this.datos.revisadoPor;
  }
  get revisadoEn(): Date | null {
    return this.datos.revisadoEn;
  }
  get motivoDeRechazo(): string | null {
    return this.datos.motivoDeRechazo;
  }
  get vigenteHasta(): FechaCivil | null {
    return this.datos.vigenteHasta;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }

  // El revisor la aprueba, diciendo hasta cuándo vale. No puede venir ya vencida.
  aprobar(
    revisadoPor: string,
    vigenteHasta: FechaCivil | null,
    hoy: FechaCivil,
    ahora: Date,
  ): void {
    this.exigirPendiente('aprobar');
    if (revisadoPor.trim() === '') {
      throw new ErrorDeValidacion(
        'Una verificación aprobada debe decir quién la revisó',
        'verificacion.sin_revisor',
      );
    }
    if (vigenteHasta !== null && vigenteHasta.esAnteriorA(hoy)) {
      throw new ErrorDeValidacion(
        'La vigencia no puede ser una fecha pasada',
        'verificacion.vigencia_pasada',
      );
    }
    this.datos.estado = 'aprobada';
    this.datos.revisadoPor = revisadoPor;
    this.datos.revisadoEn = ahora;
    this.datos.vigenteHasta = vigenteHasta;
    this.datos.motivoDeRechazo = null;
  }

  // El revisor la rechaza, y tiene que decir por qué: es lo que verá el cuidador para corregirlo.
  rechazar(revisadoPor: string, motivo: string, ahora: Date): void {
    this.exigirPendiente('rechazar');
    const limpio = motivo.normalize('NFC').trim();
    if (Array.from(limpio).length < 1 || Array.from(limpio).length > 500) {
      throw new ErrorDeValidacion(
        'El motivo del rechazo debe tener entre 1 y 500 caracteres',
        'verificacion.motivo_invalido',
      );
    }
    this.datos.estado = 'rechazada';
    this.datos.revisadoPor = revisadoPor;
    this.datos.revisadoEn = ahora;
    this.datos.motivoDeRechazo = limpio;
  }

  // Una aprobada cuya vigencia pasó queda como historial para poder pedir una nueva.
  marcarVencida(hoy: FechaCivil): void {
    if (this.datos.estado !== 'aprobada' || this.estaVigente(hoy)) {
      throw new ConflictoDeEstado(
        'Solo una verificación aprobada que ya venció se marca como vencida',
        'verificacion.no_vencida',
      );
    }
    this.datos.estado = 'vencida';
  }

  private exigirPendiente(accion: string): void {
    if (this.datos.estado !== 'pendiente') {
      throw new ConflictoDeEstado(
        `Una verificación ${this.datos.estado} no se puede ${accion}`,
        'verificacion.no_pendiente',
      );
    }
  }

  // Aprobada y todavía dentro de su vigencia. El último día de vigencia todavía vale.
  estaVigente(hoy: FechaCivil): boolean {
    if (this.datos.estado !== 'aprobada') return false;
    const hasta = this.datos.vigenteHasta;
    return hasta === null || !hasta.esAnteriorA(hoy);
  }
}
