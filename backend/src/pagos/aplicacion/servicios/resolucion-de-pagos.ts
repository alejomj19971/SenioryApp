import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import type { MotivoDePagoFallido } from '../../../compartido/eventos/pagos.js';
import type { BolsaId, MovimientoDeBolsaId } from '../../dominio/ids.js';
import type { Pago } from '../../dominio/pago.js';
import type {
  RepositorioBolsas,
  RepositorioPaquetes,
} from '../puertos/salida/repositorios.js';
import type { EventosDePagos } from './eventos-de-pagos.js';

// Lo que pasa cuando un pago pendiente por fin se resuelve, venga la noticia del aviso de la pasarela o de la tarea
// que revisa los pagos vencidos. Cambia el estado del pago, acredita la bolsa si era una compra y anuncia el
// resultado. NO guarda el pago: lo hace quien lo llama (con `guardar` si es nuevo, con `actualizar` si no), para que
// el pago y lo que cuelga de él queden en la misma transacción.
export class ResolucionDePagos {
  constructor(
    private readonly bolsas: RepositorioBolsas,
    private readonly paquetes: RepositorioPaquetes,
    private readonly eventos: EventosDePagos,
    private readonly ids: GeneradorDeIds,
  ) {}

  async aprobar(pago: Pago, ahora: Date): Promise<void> {
    pago.aprobar(ahora);
    if (pago.concepto === 'bolsa') {
      await this.acreditarBolsa(pago, ahora);
    }
    await this.eventos.publicar(
      'pagos.pago_aprobado',
      {
        pagoId: pago.id,
        pagadorId: pago.pagadorId,
        servicioId: pago.servicioId,
      },
      ahora,
    );
  }

  async rechazar(
    pago: Pago,
    motivo: MotivoDePagoFallido,
    ahora: Date,
  ): Promise<void> {
    if (motivo === 'expirado') pago.expirar(ahora);
    else pago.rechazar(ahora);
    await this.eventos.publicar(
      'pagos.pago_rechazado',
      {
        pagoId: pago.id,
        pagadorId: pago.pagadorId,
        servicioId: pago.servicioId,
        motivo,
      },
      ahora,
    );
  }

  // El pago de un paquete se aprobó: la bolsa de la familia recibe el CRÉDITO del paquete (que puede ser mayor
  // que lo pagado, si hay descuento). Se lee el paquete aunque ya no esté a la venta: la compra es anterior.
  private async acreditarBolsa(pago: Pago, ahora: Date): Promise<void> {
    const codigo = pago.paqueteCodigo;
    const paquete = codigo === null ? null : await this.paquetes.buscar(codigo);
    if (paquete === null) {
      throw new RecursoNoEncontrado(
        'El paquete de esta compra ya no existe',
        'paquete.no_encontrado',
      );
    }
    const bolsa = await this.bolsas.obtenerOCrearParaActualizar(
      pago.pagadorId,
      this.ids.nuevo<'Bolsa'>() as BolsaId,
      ahora,
    );
    bolsa.acreditar(
      paquete.credito,
      pago.id,
      this.ids.nuevo<'MovimientoDeBolsa'>() as MovimientoDeBolsaId,
      ahora,
    );
    await this.bolsas.guardar(bolsa);
    await this.eventos.publicar(
      'pagos.bolsa_comprada',
      { bolsaId: bolsa.id, familiarId: bolsa.familiarId, pagoId: pago.id },
      ahora,
    );
  }
}
