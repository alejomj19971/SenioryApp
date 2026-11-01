import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { MensajeEnviado } from '../../../compartido/eventos/mensajeria.js';
import type { CrearAvisos } from '../casos-de-uso/crear-avisos.js';
import type { RepositorioNotificaciones } from '../puertos/salida/repositorio-notificaciones.js';

// Mientras dure este rato, una conversación avisa a lo sumo una vez a cada persona: un chat animado no inunda.
export const MINUTOS_ENTRE_AVISOS_DE_MENSAJES = 5;
const TIPO = 'mensaje_nuevo:destinatario';

// Cuando alguien escribe, avisa a la otra parte, pero AGRUPADO: si ya se le avisó de esta conversación hace poco, no
// se repite (al abrir la aplicación ve todos los mensajes). El aviso no lleva el texto ni el nombre de quien escribe:
// por correo o SMS no hay privacidad para una conversación.
export class AvisarMensajeNuevo implements ManejadorDeEventos<MensajeEnviado> {
  readonly nombre = 'notificaciones.avisar_mensaje_nuevo';
  readonly tipo = 'mensajeria.mensaje_enviado';

  constructor(
    private readonly notificaciones: RepositorioNotificaciones,
    private readonly avisos: CrearAvisos,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: MensajeEnviado): Promise<void> {
    const { destinatarioId, conversacionId } = evento.datos;
    // La otra parte puede no tener cuenta todavía (solo datos de desarrollo): no hay a quién avisar.
    if (destinatarioId === null) return;
    const desde = new Date(
      this.reloj.ahora().getTime() - MINUTOS_ENTRE_AVISOS_DE_MENSAJES * 60_000,
    );
    if (
      await this.notificaciones.existeAvisoDeConversacion(
        destinatarioId,
        TIPO,
        conversacionId,
        desde,
      )
    ) {
      return;
    }
    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId,
      tipo: TIPO,
      prioridad: 'normal',
      parametros: { conversacionId },
    });
  }
}
