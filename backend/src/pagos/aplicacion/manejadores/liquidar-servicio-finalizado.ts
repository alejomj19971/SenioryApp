import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { ServicioFinalizado } from '../../../compartido/eventos/reservas.js';
import { situacionDeReserva } from '../../dominio/bolsa.js';
import type {
  BolsaId,
  LiquidacionId,
  MovimientoDeBolsaId,
} from '../../dominio/ids.js';
import { Liquidacion } from '../../dominio/liquidacion.js';
import type {
  RepositorioBolsas,
  RepositorioLiquidaciones,
  RepositorioPagos,
} from '../puertos/salida/repositorios.js';
import type { EventosDePagos } from '../servicios/eventos-de-pagos.js';

// Cuando un servicio termina, el dinero de la familia se vuelve de verdad ingreso y queda anotado lo que se le
// debe al cuidador.
//
// - Pagado con la bolsa: el saldo apartado se consume.
// - Se crea la liquidación del cuidador (una por servicio) con el pago al profesional que se congeló al contratar.
//   Quien la paga es otra tarea (DispersarLiquidaciones), fuera de esta transacción.
//
// Solo se liquida un pago aprobado: si por alguna razón el servicio terminó sin pago (solo posible con
// REQUIERE_PAGO_APROBADO apagado, en desarrollo), no hay dinero que repartir.
export class LiquidarServicioFinalizado implements ManejadorDeEventos<ServicioFinalizado> {
  readonly nombre = 'pagos.liquidar_servicio_finalizado';
  readonly tipo = 'reservas.servicio_finalizado';

  constructor(
    private readonly pagos: RepositorioPagos,
    private readonly bolsas: RepositorioBolsas,
    private readonly liquidaciones: RepositorioLiquidaciones,
    private readonly eventos: EventosDePagos,
    private readonly ids: GeneradorDeIds,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: ServicioFinalizado): Promise<void> {
    const { servicioId, cuidadorId } = evento.datos;
    const pago = await this.pagos.buscarPorServicioParaActualizar(servicioId);
    if (pago?.estado !== 'aprobado') return;
    const ahora = this.reloj.ahora();

    if (pago.medio === 'bolsa') {
      const bolsa = await this.bolsas.obtenerOCrearParaActualizar(
        pago.pagadorId,
        this.ids.nuevo<'Bolsa'>() as BolsaId,
        ahora,
      );
      const situacion = situacionDeReserva(
        await this.bolsas.movimientosDelServicio(bolsa.id, servicioId),
      );
      if (situacion.situacion === 'reservada') {
        bolsa.consumir(
          situacion.monto,
          servicioId,
          this.ids.nuevo<'MovimientoDeBolsa'>() as MovimientoDeBolsaId,
          ahora,
        );
        await this.bolsas.guardar(bolsa);
      }
    }

    const monto = pago.pagoProfesional;
    // Un servicio sin pago al profesional no genera liquidación (la base exige monto mayor que cero).
    if (monto === null || monto <= 0) return;
    const liquidacion = Liquidacion.crear({
      id: this.ids.nuevo<'Liquidacion'>() as LiquidacionId,
      cuidadorId,
      servicioId,
      monto,
      ahora,
    });
    if (await this.liquidaciones.crearSiNoExiste(liquidacion)) {
      await this.eventos.publicar(
        'pagos.liquidacion_realizada',
        { liquidacionId: liquidacion.id, cuidadorId, servicioId },
        ahora,
      );
    }
  }
}
