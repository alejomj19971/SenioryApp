import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type {
  FamiliaDeSesionesId,
  SesionDeRefrescoId,
  UsuarioId,
} from './ids.js';

// Tiempo durante el cual un token ya reemplazado todavía se acepta. El frontend puede renovar la
// sesión varias veces a la vez (varias pestañas, varias peticiones con el token vencido), y la
// segunda llega con un token que la primera ya reemplazó. Sin esta ventana, esa carrera cerraría la
// sesión de una persona legítima.
export const VENTANA_DE_GRACIA_MS = 30_000;

// SHA-256 del token opaco. Solo se guarda el hash: con la base de datos robada, los tokens no sirven.
export const BYTES_DEL_HASH_DE_TOKEN = 32;

// Qué significa que alguien presente un token de refresco.
export type UsoDeSesion =
  // Vigente y sin usar: se puede rotar.
  | 'valida'
  // Ya fue reemplazado hace menos de 30 s: una renovación simultánea. Se entrega otro par nuevo
  // de la misma familia, sin revocarla.
  | 'en_gracia'
  // Venció sin haberse usado. Se rechaza, sin más.
  | 'expirada'
  // Ya fue reemplazado hace más de 30 s: alguien se quedó con una copia. Hay que revocar TODA la familia.
  | 'reutilizada'
  // La familia fue revocada (cierre de sesión o robo detectado) y alguien sigue presentando el token.
  | 'revocada';

export interface DatosDeSesionDeRefresco {
  id: SesionDeRefrescoId;
  usuarioId: UsuarioId;
  familiaId: FamiliaDeSesionesId;
  hashDelToken: Uint8Array;
  emitidaEn: Date;
  expiraEn: Date;
  reemplazadaEn: Date | null;
  reemplazadaPor: SesionDeRefrescoId | null;
  revocadaEn: Date | null;
}

export interface DatosParaEmitirSesion {
  id: SesionDeRefrescoId;
  usuarioId: UsuarioId;
  familiaId: FamiliaDeSesionesId;
  hashDelToken: Uint8Array;
  ahora: Date;
  duracionMs: number;
}

// Un token de refresco: lo que permite renovar la sesión sin volver a escribir la contraseña.
//
// Rota en cada uso: cada renovación marca el token usado como reemplazado y emite uno nuevo de la
// misma familia. Si un token reemplazado reaparece pasada la ventana de gracia, o uno de una familia
// revocada, se considera robado y se revoca la familia completa: el ladrón y la víctima quedan
// fuera, y la víctima solo tiene que volver a iniciar sesión.
export class SesionDeRefresco {
  private constructor(private datos: DatosDeSesionDeRefresco) {}

  static emitir(datos: DatosParaEmitirSesion): SesionDeRefresco {
    if (datos.hashDelToken.length !== BYTES_DEL_HASH_DE_TOKEN) {
      throw new ErrorDeValidacion(
        `El hash del token debe tener ${BYTES_DEL_HASH_DE_TOKEN} bytes`,
        'sesion.hash_invalido',
      );
    }
    if (!Number.isSafeInteger(datos.duracionMs) || datos.duracionMs <= 0) {
      throw new ErrorDeValidacion(
        'La duración de la sesión debe ser mayor que cero',
        'sesion.duracion_invalida',
      );
    }
    return new SesionDeRefresco({
      id: datos.id,
      usuarioId: datos.usuarioId,
      familiaId: datos.familiaId,
      hashDelToken: datos.hashDelToken,
      emitidaEn: datos.ahora,
      expiraEn: new Date(datos.ahora.getTime() + datos.duracionMs),
      reemplazadaEn: null,
      reemplazadaPor: null,
      revocadaEn: null,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeSesionDeRefresco): SesionDeRefresco {
    return new SesionDeRefresco({ ...datos });
  }

  get id(): SesionDeRefrescoId {
    return this.datos.id;
  }
  get usuarioId(): UsuarioId {
    return this.datos.usuarioId;
  }
  get familiaId(): FamiliaDeSesionesId {
    return this.datos.familiaId;
  }
  get hashDelToken(): Uint8Array {
    return this.datos.hashDelToken;
  }
  get emitidaEn(): Date {
    return this.datos.emitidaEn;
  }
  get expiraEn(): Date {
    return this.datos.expiraEn;
  }
  get reemplazadaEn(): Date | null {
    return this.datos.reemplazadaEn;
  }
  get reemplazadaPor(): SesionDeRefrescoId | null {
    return this.datos.reemplazadaPor;
  }
  get revocadaEn(): Date | null {
    return this.datos.revocadaEn;
  }

  // El orden importa: revocada y reutilizada se evalúan ANTES que el vencimiento. Un token viejo
  // que reaparece es una señal de robo aunque ya haya vencido.
  evaluarUso(ahora: Date): UsoDeSesion {
    if (this.datos.revocadaEn !== null) return 'revocada';
    const reemplazadaEn = this.datos.reemplazadaEn;
    const enGracia =
      reemplazadaEn !== null &&
      ahora.getTime() - reemplazadaEn.getTime() <= VENTANA_DE_GRACIA_MS;
    if (reemplazadaEn !== null && !enGracia) return 'reutilizada';
    if (this.datos.expiraEn.getTime() <= ahora.getTime()) return 'expirada';
    return enGracia ? 'en_gracia' : 'valida';
  }

  // Marca esta sesión como reemplazada por `nueva`. Dentro de la ventana de gracia deja intacta la
  // primera marca: si se sobrescribiera, cada renovación simultánea extendería la ventana.
  rotar(ahora: Date, nueva: SesionDeRefrescoId): void {
    const uso = this.evaluarUso(ahora);
    if (uso === 'en_gracia') return;
    if (uso !== 'valida') {
      throw new ConflictoDeEstado(
        'Esta sesión ya no se puede renovar',
        'sesion.no_renovable',
      );
    }
    this.datos.reemplazadaEn = ahora;
    this.datos.reemplazadaPor = nueva;
  }

  revocar(ahora: Date): void {
    this.datos.revocadaEn ??= ahora;
  }
}
