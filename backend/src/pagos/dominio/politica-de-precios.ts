import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

export const PUNTOS_BASICOS_MAXIMOS = 10_000; // 10 000 bps = 100 %

export interface DatosDePoliticaDePrecios {
  // Crece con cada cambio de comisiones; cada servicio guarda la versión con la que se cotizó.
  version: number;
  // Lo que se le suma a la familia sobre el subtotal (800 = 8 %).
  comisionFamiliaBps: number;
  // Lo que se le descuenta al profesional del subtotal (1000 = 10 %).
  comisionProfesionalBps: number;
  vigenteDesde: Date;
}

// Las comisiones de la plataforma en un momento dado. Inmutable: un cambio de comisiones es una política
// NUEVA con otra versión, para no alterar los servicios que ya se contrataron.
export class PoliticaDePrecios {
  private constructor(private readonly datos: DatosDePoliticaDePrecios) {}

  static crear(datos: DatosDePoliticaDePrecios): PoliticaDePrecios {
    if (!Number.isSafeInteger(datos.version) || datos.version < 1) {
      throw new ErrorDeValidacion(
        'La versión de la política debe ser un entero positivo',
        'politica.version_invalida',
      );
    }
    for (const [campo, valor] of [
      ['comisionFamiliaBps', datos.comisionFamiliaBps],
      ['comisionProfesionalBps', datos.comisionProfesionalBps],
    ] as const) {
      if (
        !Number.isInteger(valor) ||
        valor < 0 ||
        valor > PUNTOS_BASICOS_MAXIMOS
      ) {
        throw new ErrorDeValidacion(
          `${campo} debe ser un entero entre 0 y ${PUNTOS_BASICOS_MAXIMOS} puntos básicos`,
          'politica.comision_invalida',
        );
      }
    }
    if (Number.isNaN(datos.vigenteDesde.getTime())) {
      throw new ErrorDeValidacion(
        'La fecha de vigencia de la política no es válida',
        'politica.vigencia_invalida',
      );
    }
    return new PoliticaDePrecios({ ...datos });
  }

  get version(): number {
    return this.datos.version;
  }
  get comisionFamiliaBps(): number {
    return this.datos.comisionFamiliaBps;
  }
  get comisionProfesionalBps(): number {
    return this.datos.comisionProfesionalBps;
  }
  get vigenteDesde(): Date {
    return this.datos.vigenteDesde;
  }
}
