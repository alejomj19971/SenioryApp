import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

// Mismo patrón que el CHECK de `identidad.usuarios.telefono`.
const FORMATO = /^\+[1-9]\d{7,14}$/;

// Teléfono en formato internacional E.164: «+» y el código del país seguido del número, sin espacios
// ni guiones (por ejemplo, +573001234567). La interfaz es la que ayuda a la persona a escribirlo así.
export class TelefonoE164 {
  private constructor(readonly valor: string) {}

  static crear(texto: string): TelefonoE164 {
    const limpio = texto.trim();
    if (!FORMATO.test(limpio)) {
      throw new ErrorDeValidacion(
        'El teléfono debe tener formato internacional, por ejemplo +573001234567',
        'telefono.invalido',
      );
    }
    return new TelefonoE164(limpio);
  }

  igualA(otro: TelefonoE164): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
