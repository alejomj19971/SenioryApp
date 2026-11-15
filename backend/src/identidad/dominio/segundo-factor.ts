import { ConflictoDeEstado } from '../../compartido/dominio/errores.js';
import type { UsuarioId } from './ids.js';

export interface DatosDeSegundoFactor {
  usuarioId: UsuarioId;
  // El secreto TOTP, cifrado (nunca en claro): ver CifradorDeSecretos.
  secretoCifrado: Uint8Array;
  // Null mientras espera que se confirme con un código válido: todavía no protege el inicio de sesión.
  activadoEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

// El segundo factor (TOTP) de un administrador. Se crea «pendiente» (con un secreto nuevo, recién
// generado) y solo empieza a exigirse en el login cuando `confirmar` demuestra que la persona configuró
// bien su app autenticadora. Reiniciar la configuración (por ejemplo, tras perder el celular) reemplaza
// el secreto y vuelve a pedir confirmación: el anterior deja de servir de inmediato.
export class SegundoFactor {
  private constructor(private datos: DatosDeSegundoFactor) {}

  static iniciar(
    usuarioId: UsuarioId,
    secretoCifrado: Uint8Array,
    ahora: Date,
  ): SegundoFactor {
    return new SegundoFactor({
      usuarioId,
      secretoCifrado,
      activadoEn: null,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeSegundoFactor): SegundoFactor {
    return new SegundoFactor({ ...datos });
  }

  get usuarioId(): UsuarioId {
    return this.datos.usuarioId;
  }
  get secretoCifrado(): Uint8Array {
    return this.datos.secretoCifrado;
  }
  get activadoEn(): Date | null {
    return this.datos.activadoEn;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }

  get estaActivo(): boolean {
    return this.datos.activadoEn !== null;
  }

  // El código de confirmación fue correcto: desde ahora el login lo exige.
  activar(ahora: Date): void {
    if (this.estaActivo) {
      throw new ConflictoDeEstado(
        'El segundo factor ya está activo',
        'segundo_factor.ya_activo',
      );
    }
    this.datos.activadoEn = ahora;
    this.datos.actualizadoEn = ahora;
  }

  // Reemplaza el secreto por uno nuevo y vuelve a pedir confirmación (reiniciar la configuración, o
  // recuperarse de haber perdido el celular). El secreto anterior queda inservible de inmediato.
  reiniciar(secretoCifrado: Uint8Array, ahora: Date): void {
    this.datos.secretoCifrado = secretoCifrado;
    this.datos.activadoEn = null;
    this.datos.actualizadoEn = ahora;
  }
}
