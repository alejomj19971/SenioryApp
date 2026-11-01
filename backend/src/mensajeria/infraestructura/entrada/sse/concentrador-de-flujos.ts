import type { AvisadorDeFlujos } from '../../../aplicacion/puertos/salida/avisador-de-flujos.js';

// Quién está escuchando en este servidor: avisa a las conexiones en vivo de una persona que revisen sus mensajes.
// Por proceso: con varias instancias, solo despierta a las conexiones de la que procesó el evento; las demás se
// enteran en su siguiente revisión periódica.
export class ConcentradorDeFlujos implements AvisadorDeFlujos {
  private readonly oyentes = new Map<string, Set<() => void>>();

  // Devuelve cómo dejar de escuchar.
  suscribir(personaId: string, alDespertar: () => void): () => void {
    const conjunto = this.oyentes.get(personaId) ?? new Set<() => void>();
    conjunto.add(alDespertar);
    this.oyentes.set(personaId, conjunto);
    return () => {
      conjunto.delete(alDespertar);
      if (conjunto.size === 0 && this.oyentes.get(personaId) === conjunto) {
        this.oyentes.delete(personaId);
      }
    };
  }

  avisarA(personaId: string): void {
    for (const alDespertar of Array.from(this.oyentes.get(personaId) ?? [])) {
      alDespertar();
    }
  }

  oyentesDe(personaId: string): number {
    return this.oyentes.get(personaId)?.size ?? 0;
  }
}
