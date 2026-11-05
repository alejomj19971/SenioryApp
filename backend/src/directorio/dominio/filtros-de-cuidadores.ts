import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import { esJornada, type Jornada } from '../../compartido/dominio/jornada.js';
import { normalizarParaBuscar } from './texto-de-busqueda.js';
import { validarUbicacion, type Ubicacion } from './ubicacion.js';
import {
  especialidadDesdeTexto,
  type Especialidad,
} from './valores-cerrados.js';

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 50;
export const LARGO_MAXIMO_DE_BUSQUEDA = 100;

// Lo que la familia puede pedir al buscar. Los textos ya vienen normalizados: es la forma en que se
// comparan con la base.
export interface FiltrosDeCuidadores {
  // Coincide con el nombre o con la especialidad.
  busqueda?: string;
  especialidad?: Especialidad;
  zona?: string;
  jornada?: Jornada;
  tarifaMaxima?: number;
  // Si viene, la búsqueda ordena por distancia real en vez de calificación (y solo trae a quien tenga
  // su propia ubicación guardada). Es la de la familia en ESE momento: nunca se guarda.
  cercaDe?: Ubicacion;
}

export interface EntradaDeFiltros {
  busqueda?: string;
  especialidad?: string;
  zona?: string;
  jornada?: string;
  tarifaMaxima?: number;
  lat?: number;
  lon?: number;
}

// Un filtro vacío («sin filtro») se ignora; uno mal formado se rechaza con un error claro.
export function crearFiltros(entrada: EntradaDeFiltros): FiltrosDeCuidadores {
  const filtros: FiltrosDeCuidadores = {};
  const busqueda = textoOpcional(entrada.busqueda, 'busqueda');
  if (busqueda !== undefined) filtros.busqueda = busqueda;
  const zona = textoOpcional(entrada.zona, 'zona');
  if (zona !== undefined) filtros.zona = zona;
  if (
    entrada.especialidad !== undefined &&
    entrada.especialidad.trim() !== ''
  ) {
    filtros.especialidad = especialidadDesdeTexto(entrada.especialidad.trim());
  }
  if (entrada.jornada !== undefined && entrada.jornada.trim() !== '') {
    const jornada = entrada.jornada.trim();
    if (!esJornada(jornada)) {
      throw new ErrorDeValidacion(
        'La jornada no es válida',
        'jornada.invalida',
      );
    }
    filtros.jornada = jornada;
  }
  if (entrada.tarifaMaxima !== undefined) {
    if (
      !Number.isSafeInteger(entrada.tarifaMaxima) ||
      entrada.tarifaMaxima <= 0
    ) {
      throw new ErrorDeValidacion(
        'La tarifa máxima debe ser un número entero mayor que cero',
        'filtro.tarifa_invalida',
      );
    }
    filtros.tarifaMaxima = entrada.tarifaMaxima;
  }
  if (entrada.lat !== undefined || entrada.lon !== undefined) {
    if (entrada.lat === undefined || entrada.lon === undefined) {
      throw new ErrorDeValidacion(
        'La búsqueda por cercanía necesita latitud y longitud juntas',
        'filtro.cerca_de_incompleto',
      );
    }
    filtros.cercaDe = validarUbicacion({
      latitud: entrada.lat,
      longitud: entrada.lon,
    });
  }
  return filtros;
}

function textoOpcional(
  texto: string | undefined,
  campo: string,
): string | undefined {
  if (texto === undefined) return undefined;
  const normalizado = normalizarParaBuscar(texto);
  if (normalizado === '') return undefined;
  if (Array.from(normalizado).length > LARGO_MAXIMO_DE_BUSQUEDA) {
    throw new ErrorDeValidacion(
      `El filtro ${campo} no puede pasar de ${LARGO_MAXIMO_DE_BUSQUEDA} caracteres`,
      `filtro.${campo}_muy_largo`,
    );
  }
  return normalizado;
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

// El orden por defecto es mejor calificación, luego menor tarifa y, para desempatar, el id. El cursor
// guarda esos tres valores de la última fila vista: la página siguiente empieza justo después, aunque
// mientras tanto cambien los demás cuidadores (la paginación no repite ni se salta a nadie).
export interface CursorDeCalificacion {
  // La calificación de ordenamiento (0 si no tiene reseñas).
  calificacion: number;
  tarifaHora: number;
  id: string;
}

// Cuando la búsqueda pide cercanía (`cercaDe`), el orden es por distancia: el cursor guarda esa distancia
// en vez de calificación y tarifa. Se distingue del otro cursor por la sola presencia de `distanciaKm`
// (sin un campo `tipo` aparte) para que un cursor ya emitido antes de este cambio siga siendo válido.
export interface CursorDeCercania {
  distanciaKm: number;
  id: string;
}

export type CursorDeCuidadores = CursorDeCalificacion | CursorDeCercania;

export function esCursorDeCercania(
  cursor: CursorDeCuidadores,
): cursor is CursorDeCercania {
  return 'distanciaKm' in cursor;
}

export function codificarCursor(cursor: CursorDeCuidadores): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodificarCursor(texto: string): CursorDeCuidadores {
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
    const registro = crudo as Record<string, unknown>;
    if ('distanciaKm' in registro) {
      const { distanciaKm, id } = registro;
      if (
        typeof distanciaKm !== 'number' ||
        !Number.isFinite(distanciaKm) ||
        distanciaKm < 0 ||
        typeof id !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(id)
      ) {
        throw invalido();
      }
      return { distanciaKm, id };
    }
    const { calificacion, tarifaHora, id } = registro;
    if (
      typeof calificacion !== 'number' ||
      !Number.isFinite(calificacion) ||
      calificacion < 0 ||
      calificacion > 5 ||
      typeof tarifaHora !== 'number' ||
      !Number.isSafeInteger(tarifaHora) ||
      tarifaHora <= 0 ||
      typeof id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(id)
    ) {
      throw invalido();
    }
    return { calificacion, tarifaHora, id };
  } catch {
    throw invalido();
  }
}
