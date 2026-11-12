import { createHmac } from 'node:crypto';
import { PasarelaDeMercadoPago } from '../../../../src/pagos/infraestructura/salida/pasarela/pasarela-mercadopago.js';
import { RelojFalso } from '../../../soporte/dobles.js';

const ACCESS_TOKEN = 'APP_USR-token-de-prueba';
const SECRETO_DE_FIRMA = 'firma-secreta-de-prueba-0123456789';

interface Llamada {
  url: string;
  metodo: string | undefined;
  encabezados: Record<string, string>;
  cuerpo: Record<string, unknown> | null;
}

// Un cliente HTTP falso: registra cada llamada y responde, en orden, con lo que le dé la prueba. No hace falta
// `vi.mock`: el cliente es una dependencia inyectada, igual que el reloj.
function clienteFalso(...respuestas: { cuerpo: unknown; estado?: number }[]) {
  const llamadas: Llamada[] = [];
  let siguiente = 0;
  const cliente = (async (url: unknown, init?: RequestInit) => {
    const encabezados = Object.fromEntries(
      new Headers(init?.headers).entries(),
    );
    llamadas.push({
      url: String(url),
      metodo: init?.method,
      encabezados,
      cuerpo:
        typeof init?.body === 'string' && init.body !== '{}'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : init?.body === '{}'
            ? {}
            : null,
    });
    const respuesta = respuestas[siguiente++] ?? respuestas.at(-1)!;
    return new Response(JSON.stringify(respuesta.cuerpo), {
      status: respuesta.estado ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { cliente, llamadas };
}

function pasarela(
  cliente: typeof fetch,
  reloj: RelojFalso = new RelojFalso(),
): PasarelaDeMercadoPago {
  return new PasarelaDeMercadoPago(
    ACCESS_TOKEN,
    SECRETO_DE_FIRMA,
    reloj,
    cliente,
  );
}

describe('PasarelaDeMercadoPago', () => {
  it('es la pasarela «mercadopago» y está habilitada', () => {
    const { cliente } = clienteFalso();
    expect(pasarela(cliente)).toMatchObject({
      nombre: 'mercadopago',
      habilitada: true,
    });
  });

  describe('crearCobro', () => {
    it('crea la orden con la duración de vigencia en segundos y devuelve el link de pago', async () => {
      const { cliente, llamadas } = clienteFalso({
        cuerpo: {
          id: 'ORD123',
          checkout_url: 'https://mercadopago.com.co/checkout/ORD123',
        },
      });
      const reloj = new RelojFalso('2026-01-01T00:00:00.000Z');

      const resultado = await pasarela(cliente, reloj).crearCobro({
        referencia: 'pago-1',
        monto: 43_200,
        descripcion: 'Seniory: servicio de cuidado',
        venceEn: new Date('2026-01-01T02:00:00.000Z'),
      });

      expect(resultado).toEqual({
        referenciaProveedor: 'ORD123',
        urlDePago: 'https://mercadopago.com.co/checkout/ORD123',
      });
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0]).toMatchObject({
        url: 'https://api.mercadopago.com/v1/orders',
        metodo: 'POST',
        encabezados: expect.objectContaining({
          authorization: `Bearer ${ACCESS_TOKEN}`,
          'x-idempotency-key': 'pago-1',
        }) as unknown,
      });
      expect(llamadas[0]!.cuerpo).toMatchObject({
        type: 'online',
        processing_mode: 'manual',
        external_reference: 'pago-1',
        total_amount: '43200',
        expiration_time: 'PT7200S',
        items: [
          {
            title: 'Seniory: servicio de cuidado',
            quantity: 1,
            unit_price: '43200',
          },
        ],
      });
    });

    it('la vigencia nunca baja de 60 segundos, así el pago ya esté por vencer', async () => {
      const { cliente, llamadas } = clienteFalso({
        cuerpo: { id: 'ORD1', checkout_url: 'https://x' },
      });
      const reloj = new RelojFalso('2026-01-01T00:00:00.000Z');

      await pasarela(cliente, reloj).crearCobro({
        referencia: 'pago-2',
        monto: 1,
        descripcion: 'x',
        venceEn: new Date('2026-01-01T00:00:01.000Z'),
      });

      expect(llamadas[0]!.cuerpo).toMatchObject({ expiration_time: 'PT60S' });
    });

    it('pedirlo otra vez con la misma referencia manda la misma clave de idempotencia', async () => {
      const { cliente, llamadas } = clienteFalso({
        cuerpo: { id: 'ORD1', checkout_url: 'https://x' },
      });
      const pedido = {
        referencia: 'pago-3',
        monto: 1,
        descripcion: 'x',
        venceEn: new Date('2026-01-01T01:00:00.000Z'),
      };

      await pasarela(cliente).crearCobro(pedido);
      await pasarela(cliente).crearCobro(pedido);

      expect(llamadas[0]!.encabezados['x-idempotency-key']).toBe('pago-3');
      expect(llamadas[1]!.encabezados['x-idempotency-key']).toBe('pago-3');
    });

    it('lanza si MercadoPago responde un error', async () => {
      const { cliente } = clienteFalso({
        cuerpo: { errors: [{ message: 'algo salió mal' }] },
        estado: 400,
      });

      await expect(
        pasarela(cliente).crearCobro({
          referencia: 'pago-4',
          monto: 1,
          descripcion: 'x',
          venceEn: new Date('2026-01-01T01:00:00.000Z'),
        }),
      ).rejects.toThrow('MercadoPago respondió 400');
    });
  });

  describe('consultarEstado', () => {
    it.each([
      ['created', 'pendiente'],
      ['processing', 'pendiente'],
      ['action_required', 'pendiente'],
      ['processed', 'aprobado'],
      ['failed', 'rechazado'],
      ['canceled', 'rechazado'],
      ['refunded', 'rechazado'],
    ])('el estado «%s» de la orden es «%s»', async (status, esperado) => {
      const { cliente, llamadas } = clienteFalso({ cuerpo: { status } });

      expect(await pasarela(cliente).consultarEstado('ORD1')).toBe(esperado);
      expect(llamadas[0]).toMatchObject({
        url: 'https://api.mercadopago.com/v1/orders/ORD1',
        encabezados: expect.objectContaining({
          authorization: `Bearer ${ACCESS_TOKEN}`,
        }) as unknown,
      });
    });
  });

  describe('reembolsar', () => {
    it('pide el reembolso total, sin monto, con la clave de idempotencia', async () => {
      const { cliente, llamadas } = clienteFalso({ cuerpo: { id: 'ORD1' } });

      await pasarela(cliente).reembolsar({
        referenciaProveedor: 'ORD1',
        monto: 43_200,
        claveDeIdempotencia: 'reembolso:pago-1',
      });

      expect(llamadas[0]).toMatchObject({
        url: 'https://api.mercadopago.com/v1/orders/ORD1/refund',
        metodo: 'POST',
        cuerpo: {},
        encabezados: expect.objectContaining({
          'x-idempotency-key': 'reembolso:pago-1',
        }) as unknown,
      });
    });

    it('lanza si el reembolso falla (orden no procesada, por ejemplo)', async () => {
      const { cliente } = clienteFalso({
        cuerpo: { errors: [{ code: 'cannot_refund_order' }] },
        estado: 400,
      });

      await expect(
        pasarela(cliente).reembolsar({
          referenciaProveedor: 'ORD1',
          monto: 1,
          claveDeIdempotencia: 'reembolso:pago-1',
        }),
      ).rejects.toThrow('MercadoPago respondió 400');
    });
  });

  describe('verificarFirma', () => {
    const cuerpo = Buffer.from(
      JSON.stringify({
        id: 123456,
        type: 'order',
        action: 'order.processed',
        data: { id: 'ORD123' },
      }),
    );
    const ts = '1700000000000';
    const idDePeticion = '11111111-2222-3333-4444-555555555555';

    function firmar(opciones: {
      secreto?: string;
      ts?: string;
      idDeLaOrden?: string | null;
      idDePeticion?: string | null;
    }): string {
      const partes = [
        opciones.idDeLaOrden === null
          ? null
          : `id:${(opciones.idDeLaOrden ?? 'ord123').toLowerCase()};`,
        opciones.idDePeticion === null
          ? null
          : `request-id:${opciones.idDePeticion ?? idDePeticion};`,
        `ts:${opciones.ts ?? ts};`,
      ]
        .filter((p): p is string => p !== null)
        .join('');
      return createHmac('sha256', opciones.secreto ?? SECRETO_DE_FIRMA)
        .update(partes)
        .digest('hex');
    }

    it('acepta una firma válida, con el id de la orden tomado del cuerpo', () => {
      const v1 = firmar({});
      expect(
        pasarela(clienteFalso().cliente).verificarFirma(cuerpo, {
          'x-signature': `ts=${ts},v1=${v1}`,
          'x-request-id': idDePeticion,
        }),
      ).toBe(true);
    });

    it('funciona igual si no viene x-request-id (se omite del manifiesto)', () => {
      const v1 = firmar({ idDePeticion: null });
      expect(
        pasarela(clienteFalso().cliente).verificarFirma(cuerpo, {
          'x-signature': `ts=${ts},v1=${v1}`,
        }),
      ).toBe(true);
    });

    it.each([
      ['firmada con otro secreto', () => firmar({ secreto: 'otro-secreto' })],
      ['con otro ts en el manifiesto', () => firmar({ ts: '1' })],
      ['con otro id de orden', () => firmar({ idDeLaOrden: 'otra-orden' })],
    ])('rechaza una firma %s', (_caso, v1Falso) => {
      expect(
        pasarela(clienteFalso().cliente).verificarFirma(cuerpo, {
          'x-signature': `ts=${ts},v1=${v1Falso()}`,
          'x-request-id': idDePeticion,
        }),
      ).toBe(false);
    });

    it('rechaza sin encabezado x-signature', () => {
      expect(
        pasarela(clienteFalso().cliente).verificarFirma(cuerpo, {
          'x-request-id': idDePeticion,
        }),
      ).toBe(false);
    });

    it('rechaza un cuerpo que no es JSON', () => {
      const v1 = firmar({});
      expect(
        pasarela(clienteFalso().cliente).verificarFirma(Buffer.from('no-json'), {
          'x-signature': `ts=${ts},v1=${v1}`,
          'x-request-id': idDePeticion,
        }),
      ).toBe(false);
    });
  });

  describe('interpretarAviso', () => {
    it('consulta la orden y traduce el estado aprobado', async () => {
      const { cliente, llamadas } = clienteFalso({
        cuerpo: {
          status: 'processed',
          external_reference: 'pago-1',
          total_amount: '43200',
        },
      });

      const aviso = await pasarela(cliente).interpretarAviso({
        id: 999,
        type: 'order',
        action: 'order.processed',
        data: { id: 'ORD123' },
      });

      expect(aviso).toEqual({
        idEventoExterno: '999',
        resultado: 'aprobado',
        referencia: 'pago-1',
        referenciaProveedor: 'ORD123',
        monto: 43_200,
      });
      expect(llamadas[0]!.url).toBe(
        'https://api.mercadopago.com/v1/orders/ORD123',
      );
    });

    it('una orden todavía pendiente se traduce como «otro» (se ignora por ahora)', async () => {
      const { cliente } = clienteFalso({
        cuerpo: { status: 'created', external_reference: 'pago-1' },
      });

      expect(
        await pasarela(cliente).interpretarAviso({
          id: 1,
          type: 'order',
          data: { id: 'ORD1' },
        }),
      ).toMatchObject({ resultado: 'otro' });
    });

    it.each([
      ['un texto', 'hola'],
      ['null', null],
      ['sin type', { id: 1, data: { id: 'ORD1' } }],
      ['con type distinto de order', { id: 1, type: 'payment', data: {} }],
      ['sin id', { type: 'order', data: { id: 'ORD1' } }],
      ['sin data.id', { id: 1, type: 'order', data: {} }],
      ['con data.id vacío', { id: 1, type: 'order', data: { id: '' } }],
    ])('devuelve null con %s', async (_caso, cuerpo) => {
      const { cliente } = clienteFalso();
      expect(await pasarela(cliente).interpretarAviso(cuerpo)).toBeNull();
    });
  });
});
