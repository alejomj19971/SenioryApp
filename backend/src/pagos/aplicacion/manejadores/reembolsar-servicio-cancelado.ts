import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { ConflictoDeEstado } from '../../../compartido/dominio/errores.js';
import type { ServicioCancelado } from '../../../compartido/eventos/reservas.js';
import { situacionDeReserva } from '../../dominio/bolsa.js';
import type { BolsaId, MovimientoDeBolsaId } from '../../dominio/ids.js';
import type { Pago } from '../../dominio/pago.js';
import type { PasarelaDePagos } from '../puertos/salida/pasarela-de-pagos.js';
import type {
  RepositorioBolsas,
  RepositorioPagos,
} from '../puertos/salida/repositorios.js';
import type { EventosDePagos } from '../servicios/eventos-de-pagos.js';

// Cuando un servicio se cancela, el dinero vuelve a la familia.
//
// - Sin pagar todavía: el pago pendiente se cierra (ya no tiene sentido pagarlo).
// - Pagado con la bolsa: el saldo apartado vuelve a estar disponible.
// - Pagado con la pasarela: se le pide el reembolso. La petición lleva una clave propia del pago, así que repetirla
//   no devuelve dos veces; si la pasarela falla, el evento se reintenta.
//
// La política de cancelación tardía (si la familia pierde algo al cancelar con poca anticipación) es una decisión de
// negocio abierta (docs/PENDIENTES.md): hoy SIEMPRE se devuelve todo. El evento ya trae las horas de anticipación para
// cuando se decida.
export class ReembolsarServicioCancelado implements ManejadorDeEventos<ServicioCancelado> {
  readonly nombre = 'pagos.reembolsar_servicio_cancelado';
  readonly tipo = 'reservas.servicio_cancelado';

  constructor(
    private readonly pagos: RepositorioPagos,
    private readonly bolsas: RepositorioBolsas,
    private readonly pasarela: PasarelaDePagos,
    private readonly eventos: EventosDePagos,
    private readonly ids: GeneradorDeIds,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: ServicioCancelado): Promise<void> {
    const pago = await this.pagos.buscarPorServicioParaActualizar(
      evento.datos.servicioId,
    );
    // Un servicio que se canceló antes de confirmarse nunca tuvo pago.
    if (pago === null) return;
    const ahora = this.reloj.ahora();

    if (pago.estado === 'pendiente') {
      pago.expirar(ahora);
      await this.pagos.actualizar(pago);
      return;
    }
    if (pago.estado !== 'aprobado') return;

    if (pago.medio === 'bolsa') {
      await this.liberarSaldo(pago, ahora);
    } else {
      await this.devolverPorLaPasarela(pago);
    }
    pago.reembolsar(ahora);
    await this.pagos.actualizar(pago);
    await this.eventos.publicar(
      'pagos.pago_reembolsado',
      {
        pagoId: pago.id,
        pagadorId: pago.pagadorId,
        servicioId: pago.servicioId,
      },
      ahora,
    );
  }

  private async liberarSaldo(pago: Pago, ahora: Date): Promise<void> {
    const servicioId = pago.servicioId as string;
    const bolsa = await this.bolsas.obtenerOCrearParaActualizar(
      pago.pagadorId,
      this.ids.nuevo<'Bolsa'>() as BolsaId,
      ahora,
    );
    const situacion = situacionDeReserva(
      await this.bolsas.movimientosDelServicio(bolsa.id, servicioId),
    );
    if (situacion.situacion !== 'reservada') return;
    bolsa.liberar(
      situacion.monto,
      servicioId,
      this.ids.nuevo<'MovimientoDeBolsa'>() as MovimientoDeBolsaId,
      ahora,
    );
    await this.bolsas.guardar(bolsa);
  }

  private async devolverPorLaPasarela(pago: Pago): Promise<void> {
    if (pago.referenciaProveedor === null) {
      // Un pago aprobado siempre debería conocer su cobro. Si no, no hay a quién pedirle el reembolso y es mejor
      // detenerse que dar por devuelto un dinero que no se devolvió.
      throw new ConflictoDeEstado(
        'No se conoce el cobro de este pago en la pasarela: no se puede reembolsar',
        'pago.sin_referencia',
      );
    }
    await this.pasarela.reembolsar({
      referenciaProveedor: pago.referenciaProveedor,
      monto: pago.montoTotal,
      claveDeIdempotencia: `reembolso:${pago.id}`,
    });
  }
}
