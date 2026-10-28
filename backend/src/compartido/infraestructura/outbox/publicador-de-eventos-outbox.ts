import type { PublicadorDeEventos } from '../../aplicacion/puertos/publicador-de-eventos.js';
import type { EventoDeIntegracion } from '../../eventos/evento-de-integracion.js';
import { outbox } from '../base-de-datos/compartido.esquema.js';
import type { ContextoTransaccional } from '../base-de-datos/contexto-transaccional.js';
import type { DespachadorDeEventos } from './despachador-de-eventos.js';

// Escribe el evento en `compartido.outbox` con la MISMA transacción del caso de uso: si el caso de
// uso se revierte, el evento desaparece con él. Tras el commit avisa al despachador para entregarlo
// de inmediato; si ese aviso se pierde (el proceso se reinicia), el sondeo lo recupera.
export class PublicadorDeEventosOutbox implements PublicadorDeEventos {
  constructor(
    private readonly contexto: ContextoTransaccional,
    private readonly despachador: DespachadorDeEventos,
  ) {}

  async publicar(evento: EventoDeIntegracion): Promise<void> {
    // Lanza si no hay unidad de trabajo: un evento fuera de transacción podría publicarse sin que
    // el cambio que anuncia exista.
    const transaccion = this.contexto.transaccionActual();
    const ocurridoEn = new Date(evento.ocurridoEn);
    if (Number.isNaN(ocurridoEn.getTime())) {
      throw new Error(
        `El evento ${evento.tipo} tiene una fecha inválida: "${evento.ocurridoEn}"`,
      );
    }
    await transaccion.insert(outbox).values({
      id: evento.id,
      tipo: evento.tipo,
      version: evento.version,
      datos: evento.datos,
      idDeCorrelacion: evento.idDeCorrelacion,
      creadoEn: ocurridoEn,
      proximaEjecucion: ocurridoEn,
    });
    this.contexto.alConfirmar(() => this.despachador.programar([evento.id]));
  }
}
