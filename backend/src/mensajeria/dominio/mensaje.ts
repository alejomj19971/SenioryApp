import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { ConversacionId, MensajeId } from './ids.js';

export const LARGO_MAXIMO_DEL_MENSAJE = 1000;

export const ROLES_DE_AUTOR = ['familiar', 'cuidador'] as const;
export type RolDeAutor = (typeof ROLES_DE_AUTOR)[number];

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Caracteres de control que no tienen cabida en un mensaje: todos menos el salto de línea y el tabulador. El NUL, en
// particular, ni siquiera cabe en una columna de texto de Postgres.
function tieneControles(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    const esControl = codigo < 0x20 || codigo === 0x7f;
    if (esControl && codigo !== 0x09 && codigo !== 0x0a && codigo !== 0x0d) {
      return true;
    }
  }
  return false;
}

// Deja el texto como se va a guardar y a mostrar: sin espacios ni saltos de línea sobrantes en los extremos y con
// saltos de línea uniformes. Es TEXTO PLANO: aquí no se interpreta nada (ni HTML ni Markdown), y se rechaza lo que no
// es texto (caracteres de control) en vez de arreglarlo en silencio.
export function normalizarTexto(texto: unknown): string {
  if (typeof texto !== 'string') {
    throw new ErrorDeValidacion(
      'El mensaje debe ser un texto',
      'mensaje.texto_invalido',
    );
  }
  if (tieneControles(texto)) {
    throw new ErrorDeValidacion(
      'El mensaje tiene caracteres que no se pueden enviar',
      'mensaje.texto_invalido',
    );
  }
  const limpio = texto.replace(/\r\n?/g, '\n').trim();
  // Se cuenta por caracteres (no por unidades de UTF-16): un emoji es uno, como lo cuenta la base de datos.
  const largo = Array.from(limpio).length;
  if (largo === 0) {
    throw new ErrorDeValidacion(
      'El mensaje no puede estar vacío',
      'mensaje.vacio',
    );
  }
  if (largo > LARGO_MAXIMO_DEL_MENSAJE) {
    throw new ErrorDeValidacion(
      `El mensaje no puede tener más de ${LARGO_MAXIMO_DEL_MENSAJE} caracteres`,
      'mensaje.muy_largo',
    );
  }
  return limpio;
}

export interface DatosDeMensaje {
  id: MensajeId;
  conversacionId: ConversacionId;
  // La cuenta de quien escribió, y en qué calidad.
  autorId: string;
  autorRol: RolDeAutor;
  texto: string;
  // Lo genera el cliente: reenviar el mismo mensaje (se cayó la red) no lo duplica.
  idDeCliente: string;
  creadoEn: Date;
}

// Un mensaje de una conversación. Inmutable: no se edita ni se borra.
export class Mensaje {
  private constructor(private readonly datos: DatosDeMensaje) {}

  static crear(entrada: DatosDeMensaje): Mensaje {
    if (!(ROLES_DE_AUTOR as readonly string[]).includes(entrada.autorRol)) {
      throw new ErrorDeValidacion(
        'El autor del mensaje no es válido',
        'mensaje.autor_invalido',
      );
    }
    if (!FORMATO_UUID.test(entrada.idDeCliente)) {
      throw new ErrorDeValidacion(
        'El identificador del mensaje no es válido',
        'mensaje.id_de_cliente_invalido',
      );
    }
    return new Mensaje({
      ...entrada,
      idDeCliente: entrada.idDeCliente.toLowerCase(),
      texto: normalizarTexto(entrada.texto),
    });
  }

  // Para reconstruir desde la base de datos: el texto ya fue validado al guardarse.
  static reconstruir(datos: DatosDeMensaje): Mensaje {
    return new Mensaje({ ...datos });
  }

  get id(): MensajeId {
    return this.datos.id;
  }
  get conversacionId(): ConversacionId {
    return this.datos.conversacionId;
  }
  get autorId(): string {
    return this.datos.autorId;
  }
  get autorRol(): RolDeAutor {
    return this.datos.autorRol;
  }
  get texto(): string {
    return this.datos.texto;
  }
  get idDeCliente(): string {
    return this.datos.idDeCliente;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
}
