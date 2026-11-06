// Replica la caja de Colombia del dominio de Directorio en el backend (`backend/src/directorio/dominio/ubicacion.ts`):
// generosa a propósito (incluye San Andrés y Providencia), solo para descartar errores obvios como un clic fuera
// del país. El backend tiene siempre la última palabra.
export const LATITUD_MINIMA = -4.5;
export const LATITUD_MAXIMA = 13.5;
export const LONGITUD_MINIMA = -82;
export const LONGITUD_MAXIMA = -66.5;

export function esUbicacionValida(latitud: unknown, longitud: unknown): boolean {
  return (
    typeof latitud === "number" &&
    Number.isFinite(latitud) &&
    latitud >= LATITUD_MINIMA &&
    latitud <= LATITUD_MAXIMA &&
    typeof longitud === "number" &&
    Number.isFinite(longitud) &&
    longitud >= LONGITUD_MINIMA &&
    longitud <= LONGITUD_MAXIMA
  );
}
