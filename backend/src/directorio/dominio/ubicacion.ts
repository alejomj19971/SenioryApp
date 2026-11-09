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

// DEBE coincidir con el radio que usa `earthdistance` en Postgres (`select earth()` → 6378168 metros), no
// con el radio medio terrestre (6371 km) que trae cualquier fórmula de Haversine de ejemplo. Si no coinciden,
// esta distancia (la que arma el cursor de paginación) queda sistemáticamente un poco por debajo de la que
// calcula la consulta SQL para la MISMA fila, así que el filtro «después del cursor» (`distancia >
// cursor.distanciaKm`) nunca la excluye: la paginación repite la última fila vista para siempre en vez de
// avanzar. No es un redondeo que se pueda ignorar — lo descubrió una prueba de integración real (M2/F2).
const RADIO_DE_LA_TIERRA_KM = 6378.168;

// Fórmula de Haversine: distancia en línea recta sobre la esfera terrestre, en kilómetros. No conoce vías
// reales ni elevación; con el mismo radio que arriba, coincide con la consulta SQL (earthdistance) que
// ordena la búsqueda, así que el cursor de paginación (construido con este valor) siempre encaja.
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
