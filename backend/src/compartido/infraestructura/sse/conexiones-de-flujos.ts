import type { BeforeApplicationShutdown } from '@nestjs/common';
import { ReglaDeNegocioIncumplida } from '../../dominio/errores.js';

// Las conexiones de eventos en vivo (SSE) abiertas ahora mismo. Una conexión así dura minutos, no milisegundos, y
// cada una ocupa un socket y un ciclo de consultas: hay que ponerles un tope por persona y cerrarlas todas al apagar
// el servidor (si no, el servidor espera por ellas y nunca termina de apagarse).
//
// Es por proceso: con varias instancias, el tope vale en cada una.
export class ConexionesDeFlujos implements BeforeApplicationShutdown {
  private readonly abiertas = new Map<string, Set<() => void>>();

  constructor(private readonly maximoPorPersona: number) {}

  // Falla ANTES de empezar a transmitir, así que la persona recibe un error normal y no un flujo roto.
  verificarCupo(personaId: string): void {
    if ((this.abiertas.get(personaId)?.size ?? 0) >= this.maximoPorPersona) {
      throw new ReglaDeNegocioIncumplida(
        'Tienes demasiadas conexiones abiertas. Cierra alguna e inténtalo de nuevo',
        'flujo.demasiadas_conexiones',
      );
    }
  }

  // Anota una conexión. `cerrar` la termina desde afuera. Devuelve cómo soltarla cuando acabe por su cuenta.
  registrar(personaId: string, cerrar: () => void): () => void {
    const conexiones = this.abiertas.get(personaId) ?? new Set<() => void>();
    conexiones.add(cerrar);
    this.abiertas.set(personaId, conexiones);
    return () => {
      conexiones.delete(cerrar);
      if (
        conexiones.size === 0 &&
        this.abiertas.get(personaId) === conexiones
      ) {
        this.abiertas.delete(personaId);
      }
    };
  }

  cuantas(personaId: string): number {
    return this.abiertas.get(personaId)?.size ?? 0;
  }

  cerrarTodas(): void {
    // Se copian las listas: cerrar una conexión la quita de ellas.
    for (const conexiones of Array.from(this.abiertas.values())) {
      for (const cerrar of Array.from(conexiones)) cerrar();
    }
  }

  // Antes de que el servidor deje de aceptar y espere a las conexiones abiertas.
  beforeApplicationShutdown(): void {
    this.cerrarTodas();
  }
}
