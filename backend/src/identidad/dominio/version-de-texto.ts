import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

// Una letra o número y hasta 19 más entre letras, números, punto, guion y guion bajo: «v1», «2026.10».
const FORMATO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;

// Versión de un texto legal (política de tratamiento de datos, consentimiento de salud). Se guarda
// con cada aceptación para poder demostrar QUÉ texto aceptó la persona. Si el texto cambia de fondo,
// sube la versión y se vuelve a pedir la autorización.
export class VersionDeTexto {
  private constructor(readonly valor: string) {}

  static crear(texto: string): VersionDeTexto {
    const limpia = texto.trim();
    if (!FORMATO.test(limpia)) {
      throw new ErrorDeValidacion(
        'La versión del texto no es válida',
        'version_de_texto.invalida',
      );
    }
    return new VersionDeTexto(limpia);
  }

  igualA(otra: VersionDeTexto): boolean {
    return this.valor === otra.valor;
  }

  toString(): string {
    return this.valor;
  }
}
