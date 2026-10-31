import type { ContextoDePeticion } from '../../../compartido/aplicacion/puertos/contexto-de-peticion.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { PublicadorDeEventos } from '../../../compartido/aplicacion/puertos/publicador-de-eventos.js';
import type { EventoDeDirectorio } from '../../../compartido/eventos/directorio.js';

type DatosDe<Tipo extends EventoDeDirectorio['tipo']> = Extract<
  EventoDeDirectorio,
  { tipo: Tipo }
>['datos'];

// Arma el sobre común de los eventos de Directorio (ID, versión, hora y correlación) y los guarda en el
// outbox. Debe usarse dentro de una unidad de trabajo, como todo el publicador.
export class EventosDeDirectorio {
  constructor(
    private readonly publicador: PublicadorDeEventos,
    private readonly ids: GeneradorDeIds,
    private readonly contexto: ContextoDePeticion,
  ) {}

  publicar<Tipo extends EventoDeDirectorio['tipo']>(
    tipo: Tipo,
    datos: DatosDe<Tipo>,
    ahora: Date,
  ): Promise<void> {
    return this.publicador.publicar({
      id: this.ids.nuevo(),
      tipo,
      version: 1,
      ocurridoEn: ahora.toISOString(),
      idDeCorrelacion: this.contexto.idDeCorrelacion(),
      datos,
    });
  }
}
