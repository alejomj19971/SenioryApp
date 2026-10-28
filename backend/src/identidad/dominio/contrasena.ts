import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

// Símbolo con el que Node permite personalizar cómo se muestra un objeto en consola y en logs.
const INSPECCION_DE_NODE = Symbol.for('nodejs.util.inspect.custom');

export const LARGO_MINIMO_DE_CONTRASENA = 10;
export const LARGO_MAXIMO_DE_CONTRASENA = 128;

// Quien decide qué contraseñas son demasiado comunes. La implementa la capa de aplicación con una
// lista de las más usadas; el dominio solo necesita la pregunta.
export interface DiccionarioDeContrasenasComunes {
  contiene(contrasena: string): boolean;
}

// Contraseña en texto claro, solo mientras se valida y se calcula su hash. NUNCA se guarda ni se
// muestra: `toString`, `toJSON` y la inspección de Node ocultan el valor, para que un descuido
// (un log, un mensaje de error) no la filtre. Para usarla se llama a `revelar()`, que deja a la vista
// en el código dónde se toca el valor real.
//
// Sigue la guía NIST 800-63B: solo largo y lista de contraseñas comunes, sin reglas de composición
// («una mayúscula y un símbolo» empuja a contraseñas predecibles); se admiten espacios y cualquier
// carácter imprimible; y se normaliza a NFKC para que la misma contraseña escrita en otro teclado o
// dispositivo produzca el mismo hash.
export class Contrasena {
  private constructor(private readonly texto: string) {}

  static crear(
    texto: string,
    comunes: DiccionarioDeContrasenasComunes,
  ): Contrasena {
    const normalizada = texto.normalize('NFKC');
    const largo = Array.from(normalizada).length;
    if (
      largo < LARGO_MINIMO_DE_CONTRASENA ||
      largo > LARGO_MAXIMO_DE_CONTRASENA
    ) {
      throw new ErrorDeValidacion(
        `La contraseña debe tener entre ${LARGO_MINIMO_DE_CONTRASENA} y ${LARGO_MAXIMO_DE_CONTRASENA} caracteres`,
        'contrasena.largo_invalido',
      );
    }
    if (/\p{Cc}/u.test(normalizada)) {
      throw new ErrorDeValidacion(
        'La contraseña no puede tener caracteres de control',
        'contrasena.caracteres_invalidos',
      );
    }
    if (comunes.contiene(normalizada)) {
      throw new ErrorDeValidacion(
        'Esa contraseña es demasiado común; elige otra',
        'contrasena.comun',
      );
    }
    return new Contrasena(normalizada);
  }

  // Para el inicio de sesión: la contraseña que escribe la persona se compara con el hash guardado,
  // así que solo se normaliza. No se le aplican las reglas de creación: una contraseña antigua
  // (por ejemplo, de antes de que cambiara la lista de comunes) debe poder seguir entrando.
  static paraVerificar(texto: string): Contrasena {
    return new Contrasena(texto.normalize('NFKC'));
  }

  revelar(): string {
    return this.texto;
  }

  toString(): string {
    return '[contraseña]';
  }

  toJSON(): string {
    return '[contraseña]';
  }

  [INSPECCION_DE_NODE](): string {
    return 'Contrasena { [oculta] }';
  }
}
