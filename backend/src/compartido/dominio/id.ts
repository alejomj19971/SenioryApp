import { ErrorDeValidacion } from './errores.js';

// Identificadores tipados (docs/backend/M0 §4.6): en tiempo de ejecución son el texto de un UUID,
// pero para el compilador un Id<'Usuario'> y un Id<'Servicio'> no se pueden intercambiar.
export type Id<Marca extends string> = string & { readonly __marca: Marca };

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Convierte un texto que viene de fuera (una ruta, un JSON) en un Id, validando que sea un UUID.
// Se normaliza a minúsculas, que es como Postgres devuelve los uuid.
export function idDesdeTexto<Marca extends string>(texto: string): Id<Marca> {
  const normalizado = texto.trim().toLowerCase();
  if (!FORMATO_UUID.test(normalizado)) {
    throw new ErrorDeValidacion(
      'El identificador no tiene un formato válido',
      'id.invalido',
    );
  }
  return normalizado as Id<Marca>;
}
