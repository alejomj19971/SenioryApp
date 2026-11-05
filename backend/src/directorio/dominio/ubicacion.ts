import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

// Caja que cubre el territorio continental e insular de Colombia (incluida San Andrés y Providencia), con
// margen: solo descarta errores evidentes (un clic fuera del país), no es una frontera exacta.
export const LATITUD_MINIMA = -4.5;
export const LATITUD_MAXIMA = 13.5;
export const LONGITUD_MINIMA = -82;
export const LONGITUD_MAXIMA = -66.5;

export interface Ubicacion {
  readonly latitud: number;
  readonly longitud: number;
}

export function validarUbicacion(datos: {
  latitud: number;
  longitud: number;
}): Ubicacion {
  const { latitud, longitud } = datos;
  if (
    !Number.isFinite(latitud) ||
    latitud < LATITUD_MINIMA ||
    latitud > LATITUD_MAXIMA ||
    !Number.isFinite(longitud) ||
    longitud < LONGITUD_MINIMA ||
    longitud > LONGITUD_MAXIMA
  ) {
    throw new ErrorDeValidacion(
      'La ubicación debe caer dentro del territorio colombiano',
      'ubicacion.fuera_de_colombia',
    );
  }
  return { latitud, longitud };
}

const RADIO_DE_LA_TIERRA_KM = 6371;

// Fórmula de Haversine: distancia en línea recta sobre la esfera terrestre, en kilómetros. No conoce vías
// reales ni elevación; es la misma aproximación que usa la consulta SQL (earthdistance) para ordenar, así
// que mostrarla aquí nunca contradice el orden de la búsqueda.
export function distanciaKm(a: Ubicacion, b: Ubicacion): number {
  const radianes = (grados: number) => (grados * Math.PI) / 180;
  const deltaLat = radianes(b.latitud - a.latitud);
  const deltaLon = radianes(b.longitud - a.longitud);
  const seno =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radianes(a.latitud)) *
      Math.cos(radianes(b.latitud)) *
      Math.sin(deltaLon / 2) ** 2;
  return (
    RADIO_DE_LA_TIERRA_KM * 2 * Math.atan2(Math.sqrt(seno), Math.sqrt(1 - seno))
  );
}
