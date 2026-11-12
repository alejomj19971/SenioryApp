import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Reloj } from '../../../../compartido/aplicacion/puertos/reloj.js';
import type {
  AvisoDeLaPasarela,
  CobroCreado,
  EstadoEnLaPasarela,
  PasarelaDePagos,
  PedidoDeCobro,
  PedidoDeReembolso,
} from '../../../aplicacion/puertos/salida/pasarela-de-pagos.js';

const URL_BASE = 'https://api.mercadopago.com';
// MercadoPago rechaza una vigencia menor a un minuto.
const SEGUNDOS_MINIMOS_DE_VIGENCIA = 60;

type ClienteHttp = typeof fetch;

function estadoDesde(status: unknown): EstadoEnLaPasarela {
  switch (status) {
    case 'processed':
      return 'aprobado';
    case 'failed':
    case 'canceled':
    case 'refunded':
      return 'rechazado';
    default:
      // created, processing, action_required: todavía no hay nada definitivo.
      return 'pendiente';
  }
}

async function cuerpoOError(
  respuesta: Response,
): Promise<Record<string, unknown>> {
  const cuerpo = (await respuesta.json()) as Record<string, unknown>;
  if (!respuesta.ok) {
    throw new Error(
      `MercadoPago respondió ${respuesta.status}: ${JSON.stringify(cuerpo)}`,
    );
  }
  return cuerpo;
}

function primerValor(valor: string | string[] | undefined): string | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
}

// El encabezado trae la forma «ts=<epoch_ms>,v1=<hex>».
function partesDeLaFirma(firma: string): {
  ts: string | null;
  v1: string | null;
} {
  const partes: Record<string, string> = {};
  for (const parte of firma.split(',')) {
    const indice = parte.indexOf('=');
    if (indice === -1) continue;
    partes[parte.slice(0, indice).trim()] = parte.slice(indice + 1).trim();
  }
  return { ts: partes.ts ?? null, v1: partes.v1 ?? null };
}

// Cobra con la API de Orders de MercadoPago (Checkout Pro): un link de pago alojado, con el mismo papel que
// cumple la pasarela simulada. Misma URL y mismo código para sandbox y producción: lo único que cambia es
// qué access token se configura (de prueba o real).
//
// A diferencia de Wompi (decisión documentada aparte), aquí SÍ se conoce la referencia real del proveedor
// desde que se crea la orden: no hace falta ningún truco para `referenciaProveedor`.
//
// El aviso (webhook) es «delgado»: solo avisa que algo cambió, sin decir qué. Por eso `interpretarAviso`
// necesita consultar la orden antes de poder traducirla (de ahí que el puerto sea asíncrono).
export class PasarelaDeMercadoPago implements PasarelaDePagos {
  readonly nombre = 'mercadopago';
  readonly habilitada = true;

  constructor(
    private readonly accessToken: string,
    private readonly secretoDeFirma: string,
    private readonly reloj: Reloj,
    private readonly cliente: ClienteHttp = fetch,
  ) {}

  async crearCobro(pedido: PedidoDeCobro): Promise<CobroCreado> {
    const segundos = Math.max(
      SEGUNDOS_MINIMOS_DE_VIGENCIA,
      Math.floor(
        (pedido.venceEn.getTime() - this.reloj.ahora().getTime()) / 1000,
      ),
    );
    const respuesta = await this.cliente(`${URL_BASE}/v1/orders`, {
      method: 'POST',
      headers: this.encabezados({ 'X-Idempotency-Key': pedido.referencia }),
      body: JSON.stringify({
        type: 'online',
        // «manual»: el link de Checkout Pro, igual que la simulada. «automatic» exige describir el medio de
        // pago en la propia orden, que es el otro flujo (Checkout API), no el que usamos.
        processing_mode: 'manual',
        external_reference: pedido.referencia,
        total_amount: String(pedido.monto),
        expiration_time: `PT${segundos}S`,
        items: [
          {
            title: pedido.descripcion,
            quantity: 1,
            unit_price: String(pedido.monto),
          },
        ],
      }),
    });
    const cuerpo = await cuerpoOError(respuesta);
    return {
      referenciaProveedor: cuerpo.id as string,
      urlDePago: cuerpo.checkout_url as string,
    };
  }

  async consultarEstado(
    referenciaProveedor: string,
  ): Promise<EstadoEnLaPasarela> {
    const respuesta = await this.cliente(
      `${URL_BASE}/v1/orders/${referenciaProveedor}`,
      { headers: this.encabezados() },
    );
    const cuerpo = await cuerpoOError(respuesta);
    return estadoDesde(cuerpo.status);
  }

  // Siempre de más (nunca parcial): es lo único que piden los casos de uso de Pagos hoy.
  async reembolsar(pedido: PedidoDeReembolso): Promise<void> {
    const respuesta = await this.cliente(
      `${URL_BASE}/v1/orders/${pedido.referenciaProveedor}/refund`,
      {
        method: 'POST',
        headers: this.encabezados({
          'X-Idempotency-Key': pedido.claveDeIdempotencia,
        }),
        body: '{}',
      },
    );
    await cuerpoOError(respuesta);
  }

  // El manifiesto exige el `id` de la orden, pero MercadoPago lo manda como parámetro de la URL del webhook,
  // y el controlador genérico (compartido con las demás pasarelas) no nos pasa la URL ni la cadena de consulta
  // — solo el cuerpo y los encabezados. MercadoPago manda el MISMO valor también en `data.id` del cuerpo, así
  // que se lee de ahí: es exactamente el mismo dato, solo que por otra vía.
  verificarFirma(
    cuerpoCrudo: Buffer,
    encabezados: Readonly<Record<string, string | string[] | undefined>>,
  ): boolean {
    const firma = primerValor(encabezados['x-signature']);
    if (firma === null) return false;
    const { ts, v1 } = partesDeLaFirma(firma);
    if (ts === null || v1 === null) return false;

    let idDeLaOrden: string | null = null;
    try {
      const cuerpo = JSON.parse(cuerpoCrudo.toString('utf8')) as Record<
        string,
        unknown
      >;
      const data = cuerpo.data as Record<string, unknown> | undefined;
      if (typeof data?.id === 'string') idDeLaOrden = data.id.toLowerCase();
    } catch {
      return false;
    }

    const idDePeticion = primerValor(encabezados['x-request-id']);
    const manifiesto = [
      idDeLaOrden === null ? null : `id:${idDeLaOrden};`,
      idDePeticion === null ? null : `request-id:${idDePeticion};`,
      `ts:${ts};`,
    ]
      .filter((parte): parte is string => parte !== null)
      .join('');

    const esperada = Buffer.from(
      createHmac('sha256', this.secretoDeFirma)
        .update(manifiesto)
        .digest('hex'),
      'utf8',
    );
    const recibida = Buffer.from(v1, 'utf8');
    return (
      recibida.length === esperada.length &&
      timingSafeEqual(recibida, esperada)
    );
  }

  async interpretarAviso(cuerpo: unknown): Promise<AvisoDeLaPasarela | null> {
    if (typeof cuerpo !== 'object' || cuerpo === null) return null;
    const { id, type, data } = cuerpo as Record<string, unknown>;
    if (type !== 'order') return null;
    if (typeof id !== 'string' && typeof id !== 'number') return null;
    const idDeLaOrden = (data as Record<string, unknown> | undefined)?.id;
    if (typeof idDeLaOrden !== 'string' || idDeLaOrden === '') return null;

    // El aviso no trae el estado: hay que ir a buscarlo.
    const respuesta = await this.cliente(
      `${URL_BASE}/v1/orders/${idDeLaOrden}`,
      { headers: this.encabezados() },
    );
    const orden = await cuerpoOError(respuesta);
    const estado = estadoDesde(orden.status);

    return {
      idEventoExterno: String(id),
      resultado: estado === 'pendiente' ? 'otro' : estado,
      referencia:
        typeof orden.external_reference === 'string'
          ? orden.external_reference
          : '',
      referenciaProveedor: idDeLaOrden,
      monto:
        typeof orden.total_amount === 'string'
          ? Number.parseInt(orden.total_amount, 10)
          : null,
    };
  }

  private encabezados(
    extra: Record<string, string> = {},
  ): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
      ...extra,
    };
  }
}
