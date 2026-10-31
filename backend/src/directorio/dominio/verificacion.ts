import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
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

  // Aprobada y todavía dentro de su vigencia. El último día de vigencia todavía vale.
  estaVigente(hoy: FechaCivil): boolean {
    if (this.datos.estado !== 'aprobada') return false;
    const hasta = this.datos.vigenteHasta;
    return hasta === null || !hasta.esAnteriorA(hoy);
  }
}
