import { v7 as uuidv7 } from 'uuid';
import type { GeneradorDeIds } from '../aplicacion/puertos/generador-de-ids.js';
import type { Id } from '../dominio/id.js';

// UUID v7: los primeros 48 bits son la hora en milisegundos, así que los IDs nuevos quedan al final
// del índice (inserciones baratas) y se pueden ordenar por fecha de creación.
// La biblioteca garantiza que dos IDs del mismo proceso salen en orden aunque compartan milisegundo.
export class GeneradorDeIdsUuidV7 implements GeneradorDeIds {
  nuevo<Marca extends string>(): Id<Marca> {
    return uuidv7() as Id<Marca>;
  }
}
