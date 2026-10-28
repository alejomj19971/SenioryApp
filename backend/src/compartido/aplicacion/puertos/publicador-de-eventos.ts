import type { EventoDeIntegracion } from '../../eventos/evento-de-integracion.js';

// Guarda el evento en el outbox dentro de la transacción actual: si el caso de uso se revierte,
// el evento tampoco existe. Falla si se llama fuera de una unidad de trabajo (adaptador en el PR 4).
export interface PublicadorDeEventos {
  publicar(evento: EventoDeIntegracion): Promise<void>;
}

export const PUBLICADOR_DE_EVENTOS = Symbol('PublicadorDeEventos');
