import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import type { AdultoMayorId, UsuarioId } from './ids.js';
import type { NombrePersona } from './nombre-persona.js';

export const EDAD_MAXIMA = 120;

export interface DatosDeAdultoMayor {
  id: AdultoMayorId;
  nombre: NombrePersona;
  fechaDeNacimiento: FechaCivil;
  fotoUrl: string | null;
  // Solo si algún día la persona mayor tiene cuenta propia; hoy casi siempre es null.
  usuarioId: UsuarioId | null;
  creadoPor: UsuarioId;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DatosParaRegistrarAdultoMayor {
  id: AdultoMayorId;
  nombre: NombrePersona;
  fechaDeNacimiento: FechaCivil;
  creadoPor: UsuarioId;
  // El día de hoy en la zona del negocio (FechaCivil.hoy), no el del servidor.
  hoy: FechaCivil;
  ahora: Date;
}

// La persona mayor que recibe el cuidado. Un familiar la registra; no necesita cuenta.
//
// La edad NO se guarda: se calcula con la fecha de nacimiento, así nunca queda desactualizada.
// No se exige una edad mínima: una familia puede necesitar cuidado para alguien de 55 años.
export class AdultoMayor {
  private constructor(private readonly datos: DatosDeAdultoMayor) {}

  static registrar(datos: DatosParaRegistrarAdultoMayor): AdultoMayor {
    if (!datos.fechaDeNacimiento.esAnteriorA(datos.hoy)) {
      throw new ErrorDeValidacion(
        'La fecha de nacimiento debe ser anterior a hoy',
        'adulto_mayor.fecha_de_nacimiento_invalida',
      );
    }
    if (datos.fechaDeNacimiento.aniosCumplidosA(datos.hoy) > EDAD_MAXIMA) {
      throw new ErrorDeValidacion(
        `La edad no puede superar los ${EDAD_MAXIMA} años`,
        'adulto_mayor.edad_invalida',
      );
    }
    return new AdultoMayor({
      id: datos.id,
      nombre: datos.nombre,
      fechaDeNacimiento: datos.fechaDeNacimiento,
      fotoUrl: null,
      usuarioId: null,
      creadoPor: datos.creadoPor,
      creadoEn: datos.ahora,
      actualizadoEn: datos.ahora,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeAdultoMayor): AdultoMayor {
    return new AdultoMayor({ ...datos });
  }

  get id(): AdultoMayorId {
    return this.datos.id;
  }
  get nombre(): NombrePersona {
    return this.datos.nombre;
  }
  get fechaDeNacimiento(): FechaCivil {
    return this.datos.fechaDeNacimiento;
  }
  get fotoUrl(): string | null {
    return this.datos.fotoUrl;
  }
  get usuarioId(): UsuarioId | null {
    return this.datos.usuarioId;
  }
  get creadoPor(): UsuarioId {
    return this.datos.creadoPor;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }

  // Años cumplidos a `hoy`. Quien nace un 29 de febrero cumple el 1 de marzo en años no bisiestos.
  edadEn(hoy: FechaCivil): number {
    return this.datos.fechaDeNacimiento.aniosCumplidosA(hoy);
  }
}
