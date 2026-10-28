import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

const LARGO_MAXIMO = 100; // el CHECK de la base cuenta caracteres, no bytes

// Caracteres de control y los que invierten el sentido de lectura (U+202A–202E y U+2066–2069):
// con ellos se puede mostrar un nombre distinto del que se guardó.
const PROHIBIDOS = /[\p{Cc}‪-‮⁦-⁩]/u;

// Nombre de una persona: entre 1 y 100 caracteres, sin espacios sobrantes. Se normaliza a NFC (la «é»
// compuesta y la «e» más el acento suelto son el mismo nombre) y cualquier tramo de espacios,
// tabulaciones o saltos de línea queda como un solo espacio.
export class NombrePersona {
  private constructor(readonly valor: string) {}

  static crear(texto: string): NombrePersona {
    const limpio = texto.normalize('NFC').replace(/\s+/gu, ' ').trim();
    const largo = Array.from(limpio).length;
    if (largo < 1 || largo > LARGO_MAXIMO || PROHIBIDOS.test(limpio)) {
      throw new ErrorDeValidacion(
        `El nombre debe tener entre 1 y ${LARGO_MAXIMO} caracteres`,
        'nombre.invalido',
      );
    }
    return new NombrePersona(limpio);
  }

  igualA(otro: NombrePersona): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
