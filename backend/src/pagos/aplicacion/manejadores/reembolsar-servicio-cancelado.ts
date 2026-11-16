import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { ConflictoDeEstado } from '../../../compartido/dominio/errores.js';
import type { ServicioCancelado } from '../../../compartido/eventos/reservas.js';
import { situacionDeReserva } from '../../dominio/bolsa.js';
import type {
  BolsaId,
  LiquidacionId,
  MovimientoDeBolsaId,
} from '../../dominio/ids.js';
import { Liquidacion } from '../../dominio/liquidacion.js';
import type { Pago } from '../../dominio/pago.js';
import type { PasarelaDePagos } from '../puertos/salida/pasarela-de-pagos.js';
import type {
  RepositorioBolsas,
  RepositorioLiquidaciones,
  RepositorioPagos,
} from '../puertos/salida/repositorios.js';
import type { EventosDePagos } from '../servicios/eventos-de-pagos.js';

// Umbral de la cancelación tardía de la familia (decisión de negocio, 2026-11-15): coincide con el plazo más
// corto que ya tiene el cuidador para aceptar un servicio de hoy.
export const HORAS_MINIMAS_PARA_CANCELAR_GRATIS = 2;

// Cuando un servicio se cancela, el dinero vuelve a la familia — salvo que la cancelación sea SUYA y tardía
// (decisión de negocio, 2026-11-15): con menos de 2 horas de anticipación, el cuidador ya había bloqueado esa
// franja (y pudo rechazar otras familias por ella), así que se reparte mitad y mitad entre devolverle a la
// familia y compensar al cuidador. Seniory no se queda con nada de esa mitad no devuelta.
//
// - Sin pagar todavía: el pago pendiente se cierra (ya no tiene sentido pagarlo).
// - Pagado con la bolsa: el saldo apartado vuelve a estar disponible (y la mitad que no vuelve se consume).
// - Pagado con la pasarela: se le pide el reembolso de lo que corresponda. La petición lleva una clave propia
//   del pago, así que repetirla no devuelve dos veces; si la pasarela falla, el evento se reintenta.
// - Rechazada, expirada, no-show o pago fallido: no es cancelación de la familia, siempre se devuelve todo.
export class ReembolsarServicioCancelado
  implements ManejadorDeEventos<ServicioCancelado>
{
  readonly nombre = 'pagos.reembolsar_servicio_cancelado';
  readonly tipo = 'reservas.servicio_cancelado';

  constructor(
    private readonly pagos: RepositorioPagos,
    private readonly bolsas: RepositorioBolsas,
    private readonly liquidaciones: RepositorioLiquidaciones,
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

    const tardia = esCancelacionTardiaDeLaFamilia(evento);
    // Con el redondeo a favor del cuidador: si el total es impar, la mitad que no se devuelve se lleva el peso
    // de más.
    const mitad = Math.floor(pago.montoTotal / 2);
    const aReembolsar = tardia ? mitad : pago.montoTotal;
    const aCompensar = tardia ? pago.montoTotal - mitad : 0;

    if (pago.medio === 'bolsa') {
      await this.liberarSaldo(pago, ahora, aReembolsar, aCompensar);
    } else if (aReembolsar > 0) {
      await this.devolverPorLaPasarela(pago, aReembolsar);
    }
    if (aCompensar > 0) {
      await this.compensarAlCuidador(
        evento.datos.cuidadorId,
        evento.datos.servicioId,
        aCompensar,
        ahora,
      );
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

  private async liberarSaldo(
    pago: Pago,
    ahora: Date,
    aLiberar: number,
    aConsumir: number,
  ): Promise<void> {
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
    // Primero libera lo que vuelve a la familia; lo que queda reservado es exactamente lo que se consume para
    // compensar al cuidador (los dos montos suman el total reservado).
    if (aLiberar > 0) {
      bolsa.liberar(
        aLiberar,
        servicioId,
        this.ids.nuevo<'MovimientoDeBolsa'>() as MovimientoDeBolsaId,
        ahora,
      );
    }
    if (aConsumir > 0) {
      bolsa.consumir(
        aConsumir,
        servicioId,
        this.ids.nuevo<'MovimientoDeBolsa'>() as MovimientoDeBolsaId,
        ahora,
      );
    }
    await this.bolsas.guardar(bolsa);
  }

  private async devolverPorLaPasarela(pago: Pago, monto: number): Promise<void> {
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
      monto,
      claveDeIdempotencia: `reembolso:${pago.id}`,
    });
  }

  // La compensación del cuidador por la cancelación tardía: la misma liquidación que recibiría por un
  // servicio terminado (una por servicio, y la paga después DispersarLiquidaciones).
  private async compensarAlCuidador(
    cuidadorId: string,
    servicioId: string,
    monto: number,
    ahora: Date,
  ): Promise<void> {
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

function esCancelacionTardiaDeLaFamilia(evento: ServicioCancelado): boolean {
  const { motivo, horasDeAnticipacion } = evento.datos;
  return (
    motivo === 'cancelada_por_familia' &&
    horasDeAnticipacion !== null &&
    horasDeAnticipacion < HORAS_MINIMAS_PARA_CANCELAR_GRATIS
  );
}
