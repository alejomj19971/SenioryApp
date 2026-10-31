import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { Dinero } from '../../../compartido/dominio/dinero.js';
import {
  ErrorDeValidacion,
  RecursoNoEncontrado,
} from '../../../compartido/dominio/errores.js';
import type { ServicioConfirmado } from '../../../compartido/eventos/reservas.js';
import { calcularServicio } from '../../dominio/calculo-de-servicio.js';
import type {
  BolsaId,
  MovimientoDeBolsaId,
  PagoId,
} from '../../dominio/ids.js';
import { Pago } from '../../dominio/pago.js';
import type { RepositorioPoliticasDePrecios } from '../puertos/salida/repositorio-politicas-de-precios.js';
import type {
  RepositorioBolsas,
  RepositorioPagos,
} from '../puertos/salida/repositorios.js';
import type { EventosDePagos } from '../servicios/eventos-de-pagos.js';
import type { ResolucionDePagos } from '../servicios/resolucion-de-pagos.js';

// Cuando un servicio queda confirmado, se cobra.
//
// - Con la pasarela: queda un pago PENDIENTE y se avisa a la familia que debe pagar. El enlace de pago se pide
//   después, cuando la familia lo necesita: no se habla con la pasarela dentro de esta transacción.
// - Con la bolsa: se aparta el saldo y el pago queda aprobado de una vez. Si no alcanza, el pago se rechaza y
//   Reservas cancela el servicio.
//
// Antes de cobrar, recalcula el desglose con la política de precios con la que se contrató y lo compara con lo que
// trae el evento: si no cuadran, no cobra (el manejador falla y el error llega a quien vigila el outbox). Reprocesar
// el evento no cobra dos veces: el pago del servicio se reconoce por su clave.
export class CobrarServicioConfirmado implements ManejadorDeEventos<ServicioConfirmado> {
  readonly nombre = 'pagos.cobrar_servicio_confirmado';
  readonly tipo = 'reservas.servicio_confirmado';

  constructor(
    private readonly pagos: RepositorioPagos,
    private readonly bolsas: RepositorioBolsas,
    private readonly politicas: RepositorioPoliticasDePrecios,
    private readonly resolucion: ResolucionDePagos,
    private readonly eventos: EventosDePagos,
    private readonly ids: GeneradorDeIds,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: ServicioConfirmado): Promise<void> {
    const { servicioId, familiarId, cobro } = evento.datos;
    if (
      (await this.pagos.buscarPorClave(
        familiarId,
        `servicio:${servicioId}`,
      )) !== null
    ) {
      return;
    }

    const politica = await this.politicas.buscarPorVersion(
      cobro.politicaVersion,
    );
    if (politica === null) {
      throw new RecursoNoEncontrado(
        'La política de precios del servicio no existe',
        'politica.no_encontrada',
      );
    }
    const desglose = calcularServicio(
      Dinero.pesos(cobro.tarifaHora),
      cobro.horas,
      politica,
    );
    if (
      desglose.totalFamilia.valor !== cobro.totalFamilia ||
      desglose.pagoProfesional.valor !== cobro.pagoProfesional
    ) {
      throw new ErrorDeValidacion(
        'El desglose del servicio no coincide con la política de precios: no se cobra',
        'pago.desglose_no_coincide',
      );
    }

    const ahora = this.reloj.ahora();
    const pago = Pago.paraServicio({
      id: this.ids.nuevo<'Pago'>() as PagoId,
      servicioId,
      pagadorId: familiarId,
      medio: cobro.medioDePago,
      montoTotal: cobro.totalFamilia,
      pagoProfesional: cobro.pagoProfesional,
      politicaVersion: cobro.politicaVersion,
      ahora,
    });

    if (cobro.medioDePago === 'bolsa') {
      await this.cobrarConLaBolsa(pago, ahora);
    } else {
      await this.pagos.guardar(pago);
      await this.eventos.publicar(
        'pagos.pago_requerido',
        { pagoId: pago.id, pagadorId: familiarId, servicioId },
        ahora,
      );
    }
  }

  private async cobrarConLaBolsa(pago: Pago, ahora: Date): Promise<void> {
    const servicioId = pago.servicioId as string;
    const bolsa = await this.bolsas.obtenerOCrearParaActualizar(
      pago.pagadorId,
      this.ids.nuevo<'Bolsa'>() as BolsaId,
      ahora,
    );
    if (!bolsa.alcanzaPara(pago.montoTotal)) {
      await this.resolucion.rechazar(pago, 'saldo_insuficiente', ahora);
      await this.pagos.guardar(pago);
      return;
    }
    bolsa.reservar(
      pago.montoTotal,
      servicioId,
      this.ids.nuevo<'MovimientoDeBolsa'>() as MovimientoDeBolsaId,
      ahora,
    );
    await this.bolsas.guardar(bolsa);
    await this.resolucion.aprobar(pago, ahora);
    await this.pagos.guardar(pago);
  }
}
