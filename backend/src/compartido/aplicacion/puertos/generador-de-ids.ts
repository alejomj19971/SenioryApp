import type { Id } from '../../dominio/id.js';

// Los IDs los genera la aplicación (UUID v7, ordenables por tiempo) para conocerlos antes de insertar.
export interface GeneradorDeIds {
  nuevo<Marca extends string>(): Id<Marca>;
}

export const GENERADOR_DE_IDS = Symbol('GeneradorDeIds');
