import { createHmac } from 'node:crypto';
import {
  ErrorDeValidacion,
  ServicioNoDisponible,
} from '../../../../src/compartido/dominio/errores.js';
import {
  DispersorDeshabilitado,
  DispersorSimulado,
} from '../../../../src/pagos/infraestructura/salida/dispersion/dispersores.js';
import { PasarelaDeshabilitada } from '../../../../src/pagos/infraestructura/salida/pasarela/pasarela-deshabilitada.js';
import {
  ENCABEZADO_DE_FIRMA_SIMULADA,
  firmarAvisoSimulado,
  PasarelaSimulada,
} from '../../../../src/pagos/infraestructura/salida/pasarela/pasarela-simulada.js';

const SECRETO = 'secreto-de-pasarela-solo-para-pruebas-0123';
const PAGO = '0198aaaa-0000-7000-8000-0000000000b1';

const pasarela = () =>
  new PasarelaSimulada(SECRETO, 'http://localhost:3001/api/v1');

describe('PasarelaSimulada con aprobación automática', () => {
  const pedido = {
    referencia: PAGO,
    monto: 43_200,
    descripcion: 'Seniory: servicio de cuidado',
    venceEn: new Date('2030-06-10T15:30:00.000Z'),
  };
  const llamadas: { url: string; init: RequestInit }[] = [];
  const clienteQueResponde = (estado = 200) =>
    ((url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return Promise.resolve(new Response(null, { status: estado }));
    }) as unknown as typeof fetch;
  const automatica = (estado = 200) =>
    new PasarelaSimulada(SECRETO, 'http://localhost:3001/api/v1', {
      urlDelFrontend: 'https://seniory.app',
      cliente: clienteQueResponde(estado),
      esperaMs: 1_500,
    });

  beforeEach(() => {
    llamadas.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('el «enlace de pago» lleva a la pantalla de retorno de Seniory, no a un proveedor', async () => {
    const cobro = await automatica().crearCobro(pedido);

    expect(cobro).toEqual({
      referenciaProveedor: `sim_${PAGO}`,
      urlDePago: `https://seniory.app/app/pagos/retorno?pago=${PAGO}`,
    });
  });

  it('a los pocos segundos le entrega a la propia API un aviso FIRMADO de pago aprobado, como una pasarela real', async () => {
    const simulada = automatica();
    await simulada.crearCobro(pedido);
    expect(llamadas).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_500);

    expect(llamadas).toHaveLength(1);
    const { url, init } = llamadas[0] as { url: string; init: RequestInit };
    expect(url).toBe('http://localhost:3001/api/v1/pagos/webhook/simulada');
    expect(init.method).toBe('POST');
    const cuerpo = init.body as string;
    expect(JSON.parse(cuerpo)).toEqual({
      idEvento: `auto_${PAGO}`,
      tipo: 'pago.aprobado',
      referencia: PAGO,
      monto: 43_200,
    });
    // La firma es válida para la pasarela: entra por el mismo camino que un aviso real.
    const encabezados = init.headers as Record<string, string>;
    expect(
      simulada.verificarFirma(Buffer.from(cuerpo), {
        [ENCABEZADO_DE_FIRMA_SIMULADA]:
          encabezados[ENCABEZADO_DE_FIRMA_SIMULADA],
      }),
    ).toBe(true);
    expect(await simulada.interpretarAviso(JSON.parse(cuerpo))).toMatchObject({
      resultado: 'aprobado',
      referencia: PAGO,
      monto: 43_200,
    });
  });

  it('el cobro queda «aprobado» en la pasarela (para quien le pregunte antes de vencerlo)', async () => {
    const simulada = automatica();
    await simulada.crearCobro(pedido);

    await vi.advanceTimersByTimeAsync(1_500);

    expect(await simulada.consultarEstado(`sim_${PAGO}`)).toBe('aprobado');
  });

  it('pedir el enlace varias veces seguidas no manda varios avisos mientras el primero va en camino', async () => {
    const simulada = automatica();
    await simulada.crearCobro(pedido);
    await simulada.crearCobro(pedido);
    await simulada.crearCobro(pedido);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(llamadas).toHaveLength(1);
  });

  it('si la API rechaza el aviso (por ejemplo, está arrancando), el cobro sigue pendiente y se puede volver a pedir', async () => {
    const simulada = automatica(503);
    await simulada.crearCobro(pedido);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await simulada.consultarEstado(`sim_${PAGO}`)).toBe('pendiente');

    await simulada.crearCobro(pedido);
    await vi.advanceTimersByTimeAsync(1_500);

    expect(llamadas).toHaveLength(2);
  });

  it('sin la opción, NO aprueba nada: es la pasarela de siempre', async () => {
    const simulada = new PasarelaSimulada(
      SECRETO,
      'http://localhost:3001/api/v1',
    );
    const cobro = await simulada.crearCobro(pedido);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(cobro.urlDePago).toBe(
      `http://localhost:3001/api/v1/pagos/simulada/${PAGO}`,
    );
    expect(await simulada.consultarEstado(`sim_${PAGO}`)).toBe('pendiente');
  });
});

describe('PasarelaSimulada', () => {
  it('es la pasarela «simulada» y está habilitada', () => {
    expect(pasarela()).toMatchObject({ nombre: 'simulada', habilitada: true });
  });

  describe('crearCobro', () => {
    const pedido = {
      referencia: PAGO,
      monto: 43_200,
      descripcion: 'Seniory: servicio de cuidado',
      venceEn: new Date('2030-06-10T15:30:00.000Z'),
    };

    it('devuelve la referencia de la pasarela y el enlace para pagar', async () => {
      expect(await pasarela().crearCobro(pedido)).toEqual({
        referenciaProveedor: `sim_${PAGO}`,
        urlDePago: `http://localhost:3001/api/v1/pagos/simulada/${PAGO}`,
      });
    });

    it('pedirlo otra vez devuelve el mismo cobro y no lo reinicia', async () => {
      const simulada = pasarela();
      await simulada.crearCobro(pedido);
      simulada.simularEstado(`sim_${PAGO}`, 'aprobado');

      const repetido = await simulada.crearCobro(pedido);

      expect(repetido.referenciaProveedor).toBe(`sim_${PAGO}`);
      expect(await simulada.consultarEstado(`sim_${PAGO}`)).toBe('aprobado');
    });
  });

  describe('consultarEstado', () => {
    it('un cobro nuevo está pendiente, y lo que no se conoce también', async () => {
      const simulada = pasarela();
      await simulada.crearCobro({
        referencia: PAGO,
        monto: 1,
        descripcion: 'x',
        venceEn: new Date(),
      });

      expect(await simulada.consultarEstado(`sim_${PAGO}`)).toBe('pendiente');
      expect(await simulada.consultarEstado('sim_desconocido')).toBe(
        'pendiente',
      );
    });

    it('responde lo que la prueba decide', async () => {
      const simulada = pasarela();
      await simulada.crearCobro({
        referencia: PAGO,
        monto: 1,
        descripcion: 'x',
        venceEn: new Date(),
      });

      simulada.simularEstado(`sim_${PAGO}`, 'rechazado');

      expect(await simulada.consultarEstado(`sim_${PAGO}`)).toBe('rechazado');
    });

    it('no deja simular el estado de un cobro que no existe', () => {
      expect(() => pasarela().simularEstado('sim_nada', 'aprobado')).toThrow(
        expect.objectContaining({
          constructor: ErrorDeValidacion,
          codigo: 'pasarela.cobro_desconocido',
        }) as Error,
      );
    });
  });

  describe('reembolsar', () => {
    it('anota el reembolso, y repetirlo con la misma clave no lo duplica', async () => {
      const simulada = pasarela();
      const pedido = {
        referenciaProveedor: `sim_${PAGO}`,
        monto: 43_200,
        claveDeIdempotencia: `reembolso:${PAGO}`,
      };

      await simulada.reembolsar(pedido);
      await simulada.reembolsar({ ...pedido, monto: 1 });

      expect(simulada.reembolsosPedidos().size).toBe(1);
      expect(simulada.reembolsosPedidos().get(`reembolso:${PAGO}`)).toEqual(
        pedido,
      );
    });
  });

  describe('verificarFirma', () => {
    const cuerpo = Buffer.from('{"idEvento":"1"}');
    const firmado = (secreto = SECRETO) =>
      createHmac('sha256', secreto).update(cuerpo).digest('hex');

    it('acepta la firma HMAC-SHA256 del cuerpo exacto', () => {
      expect(
        pasarela().verificarFirma(cuerpo, {
          [ENCABEZADO_DE_FIRMA_SIMULADA]: firmado(),
        }),
      ).toBe(true);
    });

    it('coincide con la ayuda que usan las pruebas para firmar', () => {
      expect(firmarAvisoSimulado(SECRETO, cuerpo)).toBe(firmado());
    });

    it.each([
      ['firmada con otro secreto', () => firmado('otro-secreto')],
      ['vacía', () => ''],
      ['más corta', () => firmado().slice(0, -1)],
      ['más larga', () => `${firmado()}00`],
      ['en mayúsculas', () => firmado().toUpperCase()],
      ['con el mismo largo pero distinta', () => 'a'.repeat(64)],
    ])('rechaza una firma %s', (_caso, firma) => {
      expect(
        pasarela().verificarFirma(cuerpo, {
          [ENCABEZADO_DE_FIRMA_SIMULADA]: firma(),
        }),
      ).toBe(false);
    });

    it('rechaza un aviso sin firma o con la firma repetida (arreglo)', () => {
      expect(pasarela().verificarFirma(cuerpo, {})).toBe(false);
      expect(
        pasarela().verificarFirma(cuerpo, {
          [ENCABEZADO_DE_FIRMA_SIMULADA]: [firmado(), firmado()],
        }),
      ).toBe(false);
    });

    it('rechaza un cuerpo distinto del que se firmó', () => {
      expect(
        pasarela().verificarFirma(Buffer.from('{"idEvento":"2"}'), {
          [ENCABEZADO_DE_FIRMA_SIMULADA]: firmado(),
        }),
      ).toBe(false);
    });
  });

  describe('interpretarAviso', () => {
    const base = {
      idEvento: 'evt-1',
      tipo: 'pago.aprobado',
      referencia: PAGO,
      monto: 43_200,
    };

    it('traduce un aviso de pago aprobado', async () => {
      expect(await pasarela().interpretarAviso(base)).toEqual({
        idEventoExterno: 'evt-1',
        resultado: 'aprobado',
        referencia: PAGO,
        referenciaProveedor: `sim_${PAGO}`,
        monto: 43_200,
      });
    });

    it.each([
      ['pago.rechazado', 'rechazado'],
      ['pago.aprobado', 'aprobado'],
      ['pago.cualquier-otra-cosa', 'otro'],
    ])('el tipo «%s» es un resultado «%s»', async (tipo, resultado) => {
      expect(
        await pasarela().interpretarAviso({ ...base, tipo }),
      ).toMatchObject({
        resultado,
      });
    });

    it('el monto es opcional', async () => {
      const { monto: _monto, ...sinMonto } = base;

      expect(await pasarela().interpretarAviso(sinMonto)).toMatchObject({
        monto: null,
      });
    });

    it.each([
      ['un texto', 'hola'],
      ['null', null],
      ['un número', 42],
      ['un objeto vacío', {}],
      ['sin identificador', { ...base, idEvento: undefined }],
      ['con identificador vacío', { ...base, idEvento: '' }],
      ['con identificador que no es texto', { ...base, idEvento: 5 }],
      ['sin tipo', { ...base, tipo: undefined }],
      ['sin referencia', { ...base, referencia: undefined }],
      ['con referencia vacía', { ...base, referencia: '' }],
      ['con monto con decimales', { ...base, monto: 10.5 }],
      ['con monto en texto', { ...base, monto: '43200' }],
    ])('devuelve null con %s', async (_caso, cuerpo) => {
      expect(await pasarela().interpretarAviso(cuerpo)).toBeNull();
    });
  });
});

describe('PasarelaDeshabilitada', () => {
  const pasarela = new PasarelaDeshabilitada();

  it('no está habilitada', () => {
    expect(pasarela).toMatchObject({
      nombre: 'deshabilitada',
      habilitada: false,
    });
  });

  it('cobrar y devolver responden «no disponible» en vez de fingir', async () => {
    await expect(pasarela.crearCobro()).rejects.toMatchObject({
      constructor: ServicioNoDisponible,
      codigo: 'pagos.pasarela_no_disponible',
    });
    await expect(pasarela.reembolsar()).rejects.toBeInstanceOf(
      ServicioNoDisponible,
    );
    expect(() => pasarela.consultarEstado()).toThrow(ServicioNoDisponible);
  });

  it('no da por válida ninguna firma ni entiende ningún aviso', async () => {
    expect(pasarela.verificarFirma()).toBe(false);
    expect(await pasarela.interpretarAviso()).toBeNull();
  });
});

describe('DispersorSimulado', () => {
  const orden = { liquidacionId: 'liq-1', cuidadorId: 'cui-1', monto: 36_000 };

  it('paga al instante, con una referencia que sale de la liquidación', async () => {
    const dispersor = new DispersorSimulado();

    expect(dispersor.habilitado).toBe(true);
    expect(await dispersor.dispersar(orden)).toEqual({
      estado: 'pagada',
      referencia: 'sim_pago_liq-1',
    });
    expect(dispersor.ordenesRecibidas().get('liq-1')).toEqual(orden);
  });

  it('repetir la orden de la misma liquidación no cuenta como otra', async () => {
    const dispersor = new DispersorSimulado();

    await dispersor.dispersar(orden);
    await dispersor.dispersar(orden);

    expect(dispersor.ordenesRecibidas().size).toBe(1);
  });

  it('rechaza las liquidaciones que la prueba decide', async () => {
    const dispersor = new DispersorSimulado();
    dispersor.rechazarLiquidacion('liq-1');

    expect(await dispersor.dispersar(orden)).toEqual({
      estado: 'rechazada',
      motivo: 'cuenta_inexistente',
    });
    expect(dispersor.ordenesRecibidas().size).toBe(0);
  });

  it('puede fallar de forma pasajera y recuperarse', async () => {
    const dispersor = new DispersorSimulado();
    dispersor.fallarPasajeramente(true);

    await expect(dispersor.dispersar(orden)).rejects.toThrow('no respondió');
    dispersor.fallarPasajeramente(false);

    expect(await dispersor.dispersar(orden)).toMatchObject({
      estado: 'pagada',
    });
  });
});

describe('DispersorDeshabilitado', () => {
  it('no está habilitado y no paga: responde «no disponible»', async () => {
    const dispersor = new DispersorDeshabilitado();

    expect(dispersor.habilitado).toBe(false);
    await expect(dispersor.dispersar()).rejects.toMatchObject({
      constructor: ServicioNoDisponible,
      codigo: 'pagos.dispersor_no_disponible',
    });
  });
});
