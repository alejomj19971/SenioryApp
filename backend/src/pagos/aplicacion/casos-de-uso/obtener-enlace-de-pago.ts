import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../compartido/dominio/errores.js';
import type { PagoId } from '../../dominio/ids.js';
import type { Pago } from '../../dominio/pago.js';
import type { PasarelaDePagos } from '../puertos/salida/pasarela-de-pagos.js';
import type { RepositorioPagos } from '../puertos/salida/repositorios.js';

export interface EnlaceDePago {
  urlDePago: string;
  venceEn: Date;
}

// Le pide a la pasarela el enlace al que la familia va a pagar. La pasarela se llama FUERA de cualquier
// transacción, con el identificador del pago como referencia: pedirlo dos veces devuelve el mismo cobro. Después
// queda anotada en el pago la referencia con la que la pasarela lo conoce (hace falta para reembolsar).
//
// Un pago ajeno responde «no encontrado», igual que uno que no existe.
export class ObtenerEnlaceDePago {
  constructor(
    private readonly pagos: RepositorioPagos,
    private readonly pasarela: PasarelaDePagos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly reloj: Reloj,
    private readonly minutosParaPagar: number,
  ) {}

  async ejecutar(pagadorId: string, pagoId: PagoId): Promise<EnlaceDePago> {
    const pago = await this.pagos.buscarPorId(pagoId);
    if (pago?.pagadorId !== pagadorId) {
      throw new RecursoNoEncontrado(
        'No encontramos ese pago',
        'pago.no_encontrado',
      );
    }
    return this.pedirEnlace(pago);
  }

  // Lo usa también ComprarBolsa, que ya tiene el pago a la mano.
  async pedirEnlace(pago: Pago): Promise<EnlaceDePago> {
    if (pago.medio !== 'pasarela') {
      throw new ConflictoDeEstado(
        'Este pago se descuenta de tu bolsa: no hay nada que pagar',
        'pago.sin_enlace',
      );
    }
    if (!pago.estaPendiente()) {
      throw new ConflictoDeEstado(
        'Este pago ya no está pendiente',
        'pago.no_pendiente',
      );
    }
    const venceEn = pago.venceEn(this.minutosParaPagar);
    if (venceEn.getTime() <= this.reloj.ahora().getTime()) {
      throw new ConflictoDeEstado('El plazo para pagar venció', 'pago.vencido');
    }

    const cobro = await this.pasarela.crearCobro({
      referencia: pago.id,
      monto: pago.montoTotal,
      descripcion:
        pago.concepto === 'servicio'
          ? 'Seniory: servicio de cuidado'
          : 'Seniory: bolsa de horas',
      venceEn,
    });

    await this.unidadDeTrabajo.ejecutar(async () => {
      const actual = await this.pagos.buscarPorIdParaActualizar(pago.id);
      // Entre el pedido y aquí pudo aprobarse o vencer: ya no hay nada que anotar.
      if (actual?.estaPendiente() !== true) return;
      actual.asociarReferencia(
        this.pasarela.nombre,
        cobro.referenciaProveedor,
        this.reloj.ahora(),
      );
      await this.pagos.actualizar(actual);
    });
    return { urlDePago: cobro.urlDePago, venceEn };
  }
}
