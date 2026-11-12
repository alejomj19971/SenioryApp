import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErrorDeValidacion } from '../../../../compartido/dominio/errores.js';
import type {
  AvisoDeLaPasarela,
  CobroCreado,
  EstadoEnLaPasarela,
  PasarelaDePagos,
  PedidoDeCobro,
  PedidoDeReembolso,
} from '../../../aplicacion/puertos/salida/pasarela-de-pagos.js';

export const ENCABEZADO_DE_FIRMA_SIMULADA = 'x-seniory-firma';

// Firma el cuerpo de un aviso como lo hace la pasarela simulada. La usan las pruebas para fabricar avisos; una
// pasarela real firma con su propio secreto y su propio esquema.
export function firmarAvisoSimulado(secreto: string, cuerpo: Buffer): string {
  return createHmac('sha256', secreto).update(cuerpo).digest('hex');
}

// Una pasarela de mentira para desarrollo, pruebas y staging: no mueve dinero. Cobra «en memoria» y firma sus
// avisos con un secreto compartido (HMAC-SHA256), con la misma forma de trabajo que una real: el cuerpo exacto se
// firma, la firma se compara en tiempo constante y el mismo aviso puede llegar más de una vez.
//
// La configuración la prohíbe en producción: un pago que no existe no puede darse por cobrado.
export class PasarelaSimulada implements PasarelaDePagos {
  readonly nombre = 'simulada';
  readonly habilitada = true;

  private readonly estados = new Map<string, EstadoEnLaPasarela>();
  private readonly reembolsos = new Map<string, PedidoDeReembolso>();

  constructor(
    private readonly secreto: string,
    private readonly urlPublica: string,
  ) {}

  crearCobro(pedido: PedidoDeCobro): Promise<CobroCreado> {
    const referenciaProveedor = `sim_${pedido.referencia}`;
    if (!this.estados.has(referenciaProveedor)) {
      this.estados.set(referenciaProveedor, 'pendiente');
    }
    return Promise.resolve({
      referenciaProveedor,
      urlDePago: `${this.urlPublica}/pagos/simulada/${pedido.referencia}`,
    });
  }

  consultarEstado(referenciaProveedor: string): Promise<EstadoEnLaPasarela> {
    return Promise.resolve(
      this.estados.get(referenciaProveedor) ?? 'pendiente',
    );
  }

  reembolsar(pedido: PedidoDeReembolso): Promise<void> {
    // Repetir el reembolso con la misma clave no lo duplica.
    if (!this.reembolsos.has(pedido.claveDeIdempotencia)) {
      this.reembolsos.set(pedido.claveDeIdempotencia, pedido);
    }
    return Promise.resolve();
  }

  verificarFirma(
    cuerpoCrudo: Buffer,
    encabezados: Readonly<Record<string, string | string[] | undefined>>,
  ): boolean {
    const recibida = encabezados[ENCABEZADO_DE_FIRMA_SIMULADA];
    if (typeof recibida !== 'string') return false;
    const esperada = Buffer.from(
      firmarAvisoSimulado(this.secreto, cuerpoCrudo),
      'utf8',
    );
    const entregada = Buffer.from(recibida, 'utf8');
    // `timingSafeEqual` exige el mismo largo; un largo distinto ya es una firma inválida.
    return (
      entregada.length === esperada.length &&
      timingSafeEqual(entregada, esperada)
    );
  }

  // Forma del aviso simulado: { idEvento, tipo: 'pago.aprobado' | 'pago.rechazado' | …, referencia, monto }.
  interpretarAviso(cuerpo: unknown): Promise<AvisoDeLaPasarela | null> {
    if (typeof cuerpo !== 'object' || cuerpo === null) {
      return Promise.resolve(null);
    }
    const { idEvento, tipo, referencia, monto } = cuerpo as Record<
      string,
      unknown
    >;
    if (
      typeof idEvento !== 'string' ||
      idEvento === '' ||
      typeof tipo !== 'string' ||
      typeof referencia !== 'string' ||
      referencia === ''
    ) {
      return Promise.resolve(null);
    }
    if (monto !== undefined && !Number.isSafeInteger(monto)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      idEventoExterno: idEvento,
      resultado:
        tipo === 'pago.aprobado'
          ? 'aprobado'
          : tipo === 'pago.rechazado'
            ? 'rechazado'
            : 'otro',
      referencia,
      referenciaProveedor: `sim_${referencia}`,
      monto: typeof monto === 'number' ? monto : null,
    });
  }

  // Solo para pruebas y para jugar en desarrollo: decide qué le responde esta pasarela a `consultarEstado`.
  simularEstado(referenciaProveedor: string, estado: EstadoEnLaPasarela): void {
    if (!this.estados.has(referenciaProveedor)) {
      throw new ErrorDeValidacion(
        'La pasarela simulada no conoce ese cobro',
        'pasarela.cobro_desconocido',
      );
    }
    this.estados.set(referenciaProveedor, estado);
  }

  // Solo para pruebas: los reembolsos que se pidieron, por clave de idempotencia.
  reembolsosPedidos(): ReadonlyMap<string, PedidoDeReembolso> {
    return this.reembolsos;
  }
}
