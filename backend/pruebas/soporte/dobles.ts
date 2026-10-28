import type {
  Auditoria,
  EntradaDeAuditoria,
} from '../../src/compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../src/compartido/aplicacion/puertos/generador-de-ids.js';
import type { PublicadorDeEventos } from '../../src/compartido/aplicacion/puertos/publicador-de-eventos.js';
import type { Reloj } from '../../src/compartido/aplicacion/puertos/reloj.js';
import type { Id } from '../../src/compartido/dominio/id.js';
import type { EventoDeIntegracion } from '../../src/compartido/eventos/evento-de-integracion.js';

// Dobles de los puertos de compartido para pruebas unitarias (M0 §4.11): sin base de datos ni red.

// Un reloj que solo cambia cuando la prueba lo pide.
export class RelojFalso implements Reloj {
  private instante: Date;

  constructor(inicial: Date | string = '2026-10-21T15:00:00.000Z') {
    this.instante = new Date(inicial);
  }

  ahora(): Date {
    return new Date(this.instante);
  }

  fijar(instante: Date | string): void {
    this.instante = new Date(instante);
  }

  avanzar(milisegundos: number): void {
    this.instante = new Date(this.instante.getTime() + milisegundos);
  }
}

// IDs predecibles con forma de UUID v7: ...-000000000001, ...-000000000002, etc.
export class GeneradorDeIdsSecuencial implements GeneradorDeIds {
  private siguiente = 1;

  nuevo<Marca extends string>(): Id<Marca> {
    const sufijo = String(this.siguiente++).padStart(12, '0');
    return `00000000-0000-7000-8000-${sufijo}` as Id<Marca>;
  }
}

export class PublicadorDeEventosEnMemoria implements PublicadorDeEventos {
  readonly eventos: EventoDeIntegracion[] = [];

  publicar(evento: EventoDeIntegracion): Promise<void> {
    this.eventos.push(evento);
    return Promise.resolve();
  }

  deTipo(tipo: string): EventoDeIntegracion[] {
    return this.eventos.filter((evento) => evento.tipo === tipo);
  }
}

export class AuditoriaEnMemoria implements Auditoria {
  readonly entradas: EntradaDeAuditoria[] = [];

  registrar(entrada: EntradaDeAuditoria): Promise<void> {
    this.entradas.push(entrada);
    return Promise.resolve();
  }
}
