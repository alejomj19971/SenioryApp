import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

export const LIMITE_POR_DEFECTO = 30;
export const LIMITE_MAXIMO = 100;

// Un punto en la línea de tiempo de los mensajes: (cuándo, id). Sirve para paginar hacia atrás (`antes`) y para que
// el flujo en vivo retome donde se quedó (`Last-Event-ID`). El id desempata mensajes del mismo instante, así el
// orden es total y nunca se salta ni se repite uno por esa razón.
export interface CursorDeMensajes {
  creadoEn: Date;
  id: string;
}

export function limiteDe(solicitado: number | undefined): number {
  if (solicitado === undefined) return LIMITE_POR_DEFECTO;
  if (
    !Number.isInteger(solicitado) ||
    solicitado < 1 ||
    solicitado > LIMITE_MAXIMO
  ) {
    throw new ErrorDeValidacion(
      `El límite debe ser un entero entre 1 y ${LIMITE_MAXIMO}`,
      'paginacion.limite_invalido',
    );
  }
  return solicitado;
}

export function codificarCursor(cursor: CursorDeMensajes): string {
  return Buffer.from(
    JSON.stringify({ creadoEn: cursor.creadoEn.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodificarCursor(texto: string): CursorDeMensajes {
  const invalido = () =>
    new ErrorDeValidacion(
      'El cursor no es válido',
      'paginacion.cursor_invalido',
    );
  if (texto.length === 0 || texto.length > 200) throw invalido();
  try {
    const crudo: unknown = JSON.parse(
      Buffer.from(texto, 'base64url').toString('utf8'),
    );
    if (typeof crudo !== 'object' || crudo === null) throw invalido();
    const { creadoEn, id } = crudo as Record<string, unknown>;
    if (
      typeof creadoEn !== 'string' ||
      typeof id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(id)
    ) {
      throw invalido();
    }
    const fecha = new Date(creadoEn);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString() !== creadoEn) {
      throw invalido();
    }
    return { creadoEn: fecha, id };
  } catch {
    throw invalido();
  }
}

// ¿`a` va después de `b` en la línea de tiempo?
export function esPosterior(a: CursorDeMensajes, b: CursorDeMensajes): boolean {
  const diferencia = a.creadoEn.getTime() - b.creadoEn.getTime();
  return diferencia !== 0 ? diferencia > 0 : a.id > b.id;
}
