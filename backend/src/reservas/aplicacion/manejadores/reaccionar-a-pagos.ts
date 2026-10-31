import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type {
  PagoAprobado,
  PagoRechazado,
} from '../../../compartido/eventos/pagos.js';
import type { ServicioId } from '../../dominio/ids.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';
import {
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

// Cuando Pagos avisa que el pago de un servicio quedó aprobado, Reservas lo anota: con eso el cuidador puede iniciar.
// Un pago que no es de un servicio (la compra de una bolsa) o de un servicio que ya no existe no tiene nada que anotar.
export class RegistrarPagoDelServicio implements ManejadorDeEventos<PagoAprobado> {
  readonly nombre = 'reservas.registrar_pago_del_servicio';
  readonly tipo = 'pagos.pago_aprobado';

  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: PagoAprobado): Promise<void> {
    const { servicioId } = evento.datos;
    if (servicioId === null) return;
    const servicio = await this.servicios.buscarPorIdParaActualizar(
      servicioId as ServicioId,
    );
    if (servicio === null) return;
    if (servicio.registrarPago(this.reloj.ahora())) {
      await this.servicios.actualizar(servicio);
    }
  }
}

// Cuando el pago de un servicio no se hizo (la pasarela lo rechazó, venció o la bolsa no alcanzó), el servicio se
// cancela con motivo «pago_fallido» y se avisa como cualquier cancelación (Notificaciones, y Pagos por si hay algo
// que devolver). Solo un servicio ACEPTADO se cancela: uno ya iniciado se deja terminar, y uno ya cancelado no tiene
// nada que hacer.
export class CancelarServicioPorPagoFallido implements ManejadorDeEventos<PagoRechazado> {
  readonly nombre = 'reservas.cancelar_servicio_por_pago_fallido';
  readonly tipo = 'pagos.pago_rechazado';

  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly eventos: EventosDeReservas,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: PagoRechazado): Promise<void> {
    const { servicioId } = evento.datos;
    if (servicioId === null) return;
    const servicio = await this.servicios.buscarPorIdParaActualizar(
      servicioId as ServicioId,
    );
    if (servicio?.estado !== 'aceptado') return;
    const ahora = this.reloj.ahora();
    servicio.cancelarPorPago(ahora);
    await this.servicios.actualizar(servicio);
    await this.eventos.publicar(
      'reservas.servicio_cancelado',
      {
        ...participantesDe(servicio),
        motivo: 'pago_fallido',
        horasDeAnticipacion: null,
      },
      ahora,
    );
  }
}
