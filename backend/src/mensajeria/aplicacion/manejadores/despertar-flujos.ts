import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { MensajeEnviado } from '../../../compartido/eventos/mensajeria.js';
import type { AvisadorDeFlujos } from '../puertos/salida/avisador-de-flujos.js';

// Cuando se escribe un mensaje, despierta las conexiones en vivo de las dos partes (y las otras pantallas de quien lo
// escribió) para que lo entreguen sin esperar a su siguiente revisión. Es solo una ayuda: cada conexión revisa por su
// cuenta cada pocos segundos, así que si este manejador corre en otra instancia, o no corre, nada se pierde.
export class DespertarFlujosAlEnviar implements ManejadorDeEventos<MensajeEnviado> {
  readonly nombre = 'mensajeria.despertar_flujos';
  readonly tipo = 'mensajeria.mensaje_enviado';

  constructor(private readonly avisador: AvisadorDeFlujos) {}

  manejar(evento: MensajeEnviado): Promise<void> {
    this.avisador.avisarA(evento.datos.autorId);
    if (evento.datos.destinatarioId !== null) {
      this.avisador.avisarA(evento.datos.destinatarioId);
    }
    return Promise.resolve();
  }
}
