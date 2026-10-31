import { ErrorDeValidacion } from '../../../compartido/dominio/errores.js';
import { renderizarAviso } from '../../dominio/plantillas.js';
import type { Prioridad } from '../../dominio/valores-cerrados.js';
import type {
  CursorDeNotificaciones,
  RepositorioNotificaciones,
} from '../puertos/salida/repositorio-notificaciones.js';

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 50;

export interface VistaDeNotificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  prioridad: Prioridad;
  creadaEn: string;
}

export interface PaginaDeVistasDeNotificaciones {
  notificaciones: VistaDeNotificacion[];
  siguiente: string | null;
}

export interface EntradaDeListado {
  limite?: number;
  cursor?: string;
}

// Los avisos de la propia persona, para la campana de la aplicación. Solo ve los suyos: la consulta ya filtra
// por quien pregunta, no por un id que llegue de afuera.
export class ListarMisNotificaciones {
  constructor(private readonly notificaciones: RepositorioNotificaciones) {}

  async ejecutar(
    usuarioId: string,
    entrada: EntradaDeListado,
  ): Promise<PaginaDeVistasDeNotificaciones> {
    const limite = limiteDe(entrada.limite);
    const cursor =
      entrada.cursor === undefined || entrada.cursor === ''
        ? null
        : decodificar(entrada.cursor);
    const pagina = await this.notificaciones.listarDe(
      usuarioId,
      'app',
      limite,
      cursor,
    );
    const vistas: VistaDeNotificacion[] = [];
    for (const aviso of pagina.notificaciones) {
      try {
        const texto = renderizarAviso(aviso.tipo, aviso.parametros);
        vistas.push({
          id: aviso.id,
          tipo: aviso.tipo,
          titulo: texto.titulo,
          cuerpo: texto.cuerpo,
          prioridad: aviso.prioridad,
          creadaEn: aviso.creadaEn.toISOString(),
        });
      } catch {
        // Un aviso de un tipo que ya no existe no debe romper la lista entera.
      }
    }
    return {
      notificaciones: vistas,
      siguiente: pagina.siguiente === null ? null : codificar(pagina.siguiente),
    };
  }
}

function limiteDe(solicitado: number | undefined): number {
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

export function codificar(cursor: CursorDeNotificaciones): string {
  return Buffer.from(
    JSON.stringify({ creadaEn: cursor.creadaEn.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodificar(texto: string): CursorDeNotificaciones {
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
    const { creadaEn, id } = crudo as Record<string, unknown>;
    if (
      typeof creadaEn !== 'string' ||
      typeof id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(id)
    ) {
      throw invalido();
    }
    const fecha = new Date(creadaEn);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString() !== creadaEn) {
      throw invalido();
    }
    return { creadaEn: fecha, id };
  } catch {
    throw invalido();
  }
}
