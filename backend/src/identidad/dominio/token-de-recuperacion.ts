import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { TokenDeRecuperacionId, UsuarioId } from './ids.js';

// SHA-256 del token: con la base de datos robada, los enlaces de recuperación no sirven.
export const BYTES_DEL_HASH_DE_RECUPERACION = 32;

export type EstadoDeToken = 'valido' | 'usado' | 'expirado';

export interface DatosDeTokenDeRecuperacion {
  id: TokenDeRecuperacionId;
  usuarioId: UsuarioId;
  hashDelToken: Uint8Array;
  creadoEn: Date;
  expiraEn: Date;
  usadoEn: Date | null;
}

export interface DatosParaEmitirTokenDeRecuperacion {
  id: TokenDeRecuperacionId;
  usuarioId: UsuarioId;
  hashDelToken: Uint8Array;
  ahora: Date;
  duracionMs: number;
}

// El permiso de cambiar la contraseña sin conocer la actual, que se entrega por un canal que solo la
// persona controla (su correo). Por eso es corto, de un solo uso, y reemplazarlo invalida el anterior:
// solo sirve el último enlace que se pidió.
export class TokenDeRecuperacion {
  private constructor(private readonly datos: DatosDeTokenDeRecuperacion) {}

  static emitir(
    datos: DatosParaEmitirTokenDeRecuperacion,
  ): TokenDeRecuperacion {
    if (datos.hashDelToken.length !== BYTES_DEL_HASH_DE_RECUPERACION) {
      throw new ErrorDeValidacion(
        `El hash del token debe tener ${BYTES_DEL_HASH_DE_RECUPERACION} bytes`,
        'recuperacion.hash_invalido',
      );
    }
    if (!Number.isSafeInteger(datos.duracionMs) || datos.duracionMs <= 0) {
      throw new ErrorDeValidacion(
        'La duración del enlace debe ser mayor que cero',
        'recuperacion.duracion_invalida',
      );
    }
    return new TokenDeRecuperacion({
      id: datos.id,
      usuarioId: datos.usuarioId,
      hashDelToken: datos.hashDelToken,
      creadoEn: datos.ahora,
      expiraEn: new Date(datos.ahora.getTime() + datos.duracionMs),
      usadoEn: null,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeTokenDeRecuperacion): TokenDeRecuperacion {
    return new TokenDeRecuperacion({ ...datos });
  }

  get id(): TokenDeRecuperacionId {
    return this.datos.id;
  }
  get usuarioId(): UsuarioId {
    return this.datos.usuarioId;
  }
  get hashDelToken(): Uint8Array {
    return this.datos.hashDelToken;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get expiraEn(): Date {
    return this.datos.expiraEn;
  }
  get usadoEn(): Date | null {
    return this.datos.usadoEn;
  }

  // «Usado» se evalúa antes que el vencimiento: un enlace ya gastado nunca vuelve a servir.
  evaluar(ahora: Date): EstadoDeToken {
    if (this.datos.usadoEn !== null) return 'usado';
    if (this.datos.expiraEn.getTime() <= ahora.getTime()) return 'expirado';
    return 'valido';
  }

  usar(ahora: Date): void {
    if (this.evaluar(ahora) !== 'valido') {
      throw new ConflictoDeEstado(
        'Este enlace ya no se puede usar',
        'recuperacion.enlace_no_valido',
      );
    }
    this.datos.usadoEn = ahora;
  }
}
