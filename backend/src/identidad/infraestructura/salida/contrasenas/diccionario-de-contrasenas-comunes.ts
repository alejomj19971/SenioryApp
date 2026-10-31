import { readFileSync } from 'node:fs';
import type { DiccionarioDeContrasenasComunes } from '../../../dominio/contrasena.js';

// Símbolo con el que el módulo registra el diccionario (lo usan también los comandos de consola).
export const DICCIONARIO_DE_CONTRASENAS = Symbol(
  'DiccionarioDeContrasenasComunes',
);

const ARCHIVO = new URL('./contrasenas-comunes.txt', import.meta.url);

// Las contraseñas más usadas del mundo (ver contrasenas-comunes.LICENCIA.md), cargadas una vez al
// arrancar. La lista está en minúsculas y la comparación no distingue mayúsculas: «Password123» cae
// igual que «password123».
export class DiccionarioDeContrasenasComunesDeArchivo implements DiccionarioDeContrasenasComunes {
  private readonly comunes: ReadonlySet<string>;

  constructor(contenido: string = readFileSync(ARCHIVO, 'utf8')) {
    this.comunes = new Set(
      contenido
        .split('\n')
        .map((linea) => linea.trim())
        .filter((linea) => linea !== ''),
    );
  }

  get cantidad(): number {
    return this.comunes.size;
  }

  contiene(contrasena: string): boolean {
    return this.comunes.has(contrasena.toLowerCase());
  }
}
