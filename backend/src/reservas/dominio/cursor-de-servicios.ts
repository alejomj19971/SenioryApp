import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 50;

// Desde dónde seguir al paginar «mis servicios». Se ordena por fecha de creación (la más reciente primero) y
// luego por id: el cursor guarda esos dos valores de la última fila vista, así la página siguiente empieza
// justo después aunque mientras tanto entren servicios nuevos.
export interface CursorDeServicios {
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

export function codificarCursor(cursor: CursorDeServicios): string {
  return Buffer.from(
    JSON.stringify({ creadoEn: cursor.creadoEn.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodificarCursor(texto: string): CursorDeServicios {
  const invalido = () =>
    new ErrorDeValidacion(
      'El cursor no es válido',
      'paginacion.cursor_invalido',
    );
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
