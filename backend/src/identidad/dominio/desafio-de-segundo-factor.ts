import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { DesafioDeSegundoFactorId, UsuarioId } from './ids.js';

// SHA-256 del token: con la base de datos robada, los desafíos no sirven.
export const BYTES_DEL_HASH_DEL_DESAFIO = 32;

export type EstadoDelDesafio = 'valido' | 'usado' | 'expirado';

export interface DatosDeDesafioDeSegundoFactor {
  id: DesafioDeSegundoFactorId;
  usuarioId: UsuarioId;
  hashDelToken: Uint8Array;
  creadoEn: Date;
  expiraEn: Date;
  usadoEn: Date | null;
}

export interface DatosParaEmitirDesafio {
  id: DesafioDeSegundoFactorId;
  usuarioId: UsuarioId;
  hashDelToken: Uint8Array;
  ahora: Date;
  duracionMs: number;
}

// Entre la contraseña correcta y el código del segundo factor: demuestra que ya se pasó el primer paso,
// sin dar todavía una sesión. Corto, de un solo uso, igual de forma que TokenDeRecuperacion (misma idea:
// un permiso de vida corta que viaja fuera de la base de datos).
export class DesafioDeSegundoFactor {
  private constructor(private readonly datos: DatosDeDesafioDeSegundoFactor) {}

  static emitir(datos: DatosParaEmitirDesafio): DesafioDeSegundoFactor {
    if (datos.hashDelToken.length !== BYTES_DEL_HASH_DEL_DESAFIO) {
      throw new ErrorDeValidacion(
        `El hash del desafío debe tener ${BYTES_DEL_HASH_DEL_DESAFIO} bytes`,
        'segundo_factor.hash_invalido',
      );
    }
    if (!Number.isSafeInteger(datos.duracionMs) || datos.duracionMs <= 0) {
      throw new ErrorDeValidacion(
        'La duración del desafío debe ser mayor que cero',
        'segundo_factor.duracion_invalida',
      );
    }
    return new DesafioDeSegundoFactor({
      id: datos.id,
      usuarioId: datos.usuarioId,
      hashDelToken: datos.hashDelToken,
      creadoEn: datos.ahora,
      expiraEn: new Date(datos.ahora.getTime() + datos.duracionMs),
      usadoEn: null,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(
    datos: DatosDeDesafioDeSegundoFactor,
  ): DesafioDeSegundoFactor {
    return new DesafioDeSegundoFactor({ ...datos });
  }

  get id(): DesafioDeSegundoFactorId {
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

  // «Usado» se evalúa antes que el vencimiento: un desafío ya gastado nunca vuelve a servir.
  evaluar(ahora: Date): EstadoDelDesafio {
    if (this.datos.usadoEn !== null) return 'usado';
    if (this.datos.expiraEn.getTime() <= ahora.getTime()) return 'expirado';
    return 'valido';
  }

  usar(ahora: Date): void {
    if (this.evaluar(ahora) !== 'valido') {
      throw new ConflictoDeEstado(
        'Este desafío ya no se puede usar',
        'segundo_factor.desafio_no_valido',
      );
    }
    this.datos.usadoEn = ahora;
  }
}
