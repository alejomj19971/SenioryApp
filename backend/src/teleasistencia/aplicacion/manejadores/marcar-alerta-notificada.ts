import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { NotificacionEntregada } from '../../../compartido/eventos/notificaciones.js';
import type { AlertaId } from '../../dominio/alerta.js';
import type { RepositorioAlertas } from '../puertos/salida/repositorios.js';

// Cuando Notificaciones entrega el primer aviso de una alerta, la alerta pasa a «notificada» y queda guardado
// cuándo salió: con `generada_en` mide E11 (menos de 30 s en el 95 % de los casos). Solo cuenta el primero; los
// avisos de los demás canales y destinatarios llegan después y no cambian nada.
export class MarcarAlertaNotificada implements ManejadorDeEventos<NotificacionEntregada> {
  readonly nombre = 'teleasistencia.marcar_alerta_notificada';
  readonly tipo = 'notificaciones.notificacion_entregada';

  constructor(private readonly alertas: RepositorioAlertas) {}

  async manejar(evento: NotificacionEntregada): Promise<void> {
    const alerta = await this.alertas.buscarPorIdParaActualizar(
      evento.datos.alertaId as AlertaId,
    );
    // Una alerta que ya no existe no tiene nada que marcar.
    if (alerta === null) return;
    if (alerta.registrarEntrega(new Date(evento.datos.entregadaEn))) {
      await this.alertas.actualizar(alerta);
    }
  }
}
