import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { UsuarioId } from './ids.js';

export const INTENTOS_POR_BLOQUEO = 5;
export const BLOQUEO_INICIAL_MS = 15 * 60_000;
export const BLOQUEO_MAXIMO_MS = 24 * 60 * 60_000;
// El contador se detiene aquí para no desbordar la columna `smallint`. Es un múltiplo de
// INTENTOS_POR_BLOQUEO: con el contador en el tope, cada fallo vuelve a bloquear 24 h.
const TOPE_DEL_CONTADOR = 1_000;

// Un hash guardado nunca debe ser una contraseña en claro. Todos los formatos PHC (argon2, bcrypt,
// scrypt) empiezan por «$algoritmo$»; exigirlo atrapa el error más grave posible: guardar el texto
// que escribió la persona.
const FORMATO_PHC = /^\$[a-z0-9-]+\$.+/;

export interface ResultadoDeFallo {
  bloqueada: boolean;
  bloqueadoHasta: Date | null;
}

export interface DatosDeCredencial {
  usuarioId: UsuarioId;
  hash: string;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
  actualizadoEn: Date;
}

// La contraseña de un usuario (solo su hash) y el control de intentos fallidos.
//
// Bloqueo progresivo: cada 5 fallos seguidos la cuenta se bloquea, 15 minutos la primera vez y el
// doble en cada bloqueo siguiente, hasta 24 horas (fallo 5 → 15 min, fallo 10 → 30 min, fallo 15 →
// 1 h…). Solo un inicio de sesión exitoso reinicia el contador. Los intentos durante un bloqueo no
// cuentan ni lo extienden: así quien conoce el correo de otra persona no puede mantenerla fuera
// para siempre solo con seguir intentando.
export class Credencial {
  private constructor(private datos: DatosDeCredencial) {}

  static nueva(usuarioId: UsuarioId, hash: string, ahora: Date): Credencial {
    exigirHash(hash);
    return new Credencial({
      usuarioId,
      hash,
      intentosFallidos: 0,
      bloqueadoHasta: null,
      actualizadoEn: ahora,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeCredencial): Credencial {
    return new Credencial({ ...datos });
  }

  get usuarioId(): UsuarioId {
    return this.datos.usuarioId;
  }
  get hash(): string {
    return this.datos.hash;
  }
  get intentosFallidos(): number {
    return this.datos.intentosFallidos;
  }
  get bloqueadoHasta(): Date | null {
    return this.datos.bloqueadoHasta;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }

  estaBloqueada(ahora: Date): boolean {
    const hasta = this.datos.bloqueadoHasta;
    return hasta !== null && hasta.getTime() > ahora.getTime();
  }

  // Registra una contraseña equivocada. Durante un bloqueo no hace nada.
  registrarFallo(ahora: Date): ResultadoDeFallo {
    if (this.estaBloqueada(ahora)) {
      return { bloqueada: true, bloqueadoHasta: this.datos.bloqueadoHasta };
    }
    const intentos = Math.min(
      this.datos.intentosFallidos + 1,
      TOPE_DEL_CONTADOR,
    );
    this.datos.intentosFallidos = intentos;
    this.datos.actualizadoEn = ahora;
    if (intentos % INTENTOS_POR_BLOQUEO === 0) {
      this.datos.bloqueadoHasta = new Date(
        ahora.getTime() + duracionDelBloqueo(intentos),
      );
      return { bloqueada: true, bloqueadoHasta: this.datos.bloqueadoHasta };
    }
    return { bloqueada: false, bloqueadoHasta: this.datos.bloqueadoHasta };
  }

  // Registra un inicio de sesión correcto. Falla si la cuenta está bloqueada: aunque la contraseña
  // sea la correcta, un bloqueo no se levanta antes de tiempo (quien llama debe haber comprobado
  // `estaBloqueada` ANTES de verificar la contraseña).
  registrarExito(ahora: Date): void {
    if (this.estaBloqueada(ahora)) {
      throw new ConflictoDeEstado(
        'La cuenta está bloqueada',
        'credencial.bloqueada',
      );
    }
    this.datos.intentosFallidos = 0;
    this.datos.bloqueadoHasta = null;
    this.datos.actualizadoEn = ahora;
  }

  // La persona eligió una contraseña nueva (recuperó la cuenta o la cambió). A diferencia de
  // `cambiarHash`, también levanta el bloqueo y reinicia los intentos: quien acaba de demostrar que
  // controla su correo (o su contraseña actual) no tiene por qué seguir fuera.
  restablecer(hash: string, ahora: Date): void {
    exigirHash(hash);
    this.datos.hash = hash;
    this.datos.intentosFallidos = 0;
    this.datos.bloqueadoHasta = null;
    this.datos.actualizadoEn = ahora;
  }

  // Cambia el hash (por ejemplo, al subir los parámetros de argon2). No toca el control de intentos.
  cambiarHash(hash: string, ahora: Date): void {
    exigirHash(hash);
    this.datos.hash = hash;
    this.datos.actualizadoEn = ahora;
  }
}

function duracionDelBloqueo(intentos: number): number {
  const bloqueos = intentos / INTENTOS_POR_BLOQUEO;
  return Math.min(BLOQUEO_INICIAL_MS * 2 ** (bloqueos - 1), BLOQUEO_MAXIMO_MS);
}

function exigirHash(hash: string): void {
  if (!FORMATO_PHC.test(hash)) {
    throw new ErrorDeValidacion(
      'El hash de la contraseña no tiene un formato válido',
      'credencial.hash_invalido',
    );
  }
}
