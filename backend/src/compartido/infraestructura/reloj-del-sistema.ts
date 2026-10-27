import type { Reloj } from '../aplicacion/puertos/reloj.js';

export class RelojDelSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}
