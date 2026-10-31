import type { ContextoDePeticion } from '../../../compartido/aplicacion/puertos/contexto-de-peticion.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { PublicadorDeEventos } from '../../../compartido/aplicacion/puertos/publicador-de-eventos.js';
import type { NotificacionEntregada } from '../../../compartido/eventos/notificaciones.js';

// Arma el sobre común de los eventos de Notificaciones (ID, versión, hora y correlación) y los guarda en el outbox.
// Debe usarse dentro de una unidad de trabajo, como todo el publicador.
export class EventosDeNotificaciones {
  constructor(
    private readonly publicador: PublicadorDeEventos,
    private readonly ids: GeneradorDeIds,
    private readonly contexto: ContextoDePeticion,
  ) {}

  publicar(
    tipo: NotificacionEntregada['tipo'],
    datos: NotificacionEntregada['datos'],
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
