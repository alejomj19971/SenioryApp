import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../../../src/compartido/dominio/errores.js';
import type { PagoId } from '../../../../src/pagos/dominio/ids.js';
import { Pago } from '../../../../src/pagos/dominio/pago.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const AHORA = new Date('2030-06-10T15:00:00.000Z');
const MAS_TARDE = new Date('2030-06-10T15:20:00.000Z');

const servicio = (
  cambios: Partial<Parameters<typeof Pago.paraServicio>[0]> = {},
) =>
  Pago.paraServicio({
    id: idDePrueba<'Pago'>() as PagoId,
    servicioId: idDePrueba<'Servicio'>(),
    pagadorId: idDePrueba<'Usuario'>(),
    medio: 'pasarela',
    montoTotal: 43_200,
    pagoProfesional: 36_000,
    politicaVersion: 1,
    ahora: AHORA,
    ...cambios,
  });

const bolsa = (cambios: Partial<Parameters<typeof Pago.paraBolsa>[0]> = {}) =>
  Pago.paraBolsa({
    id: idDePrueba<'Pago'>() as PagoId,
    paqueteCodigo: 'bolsa-20',
    pagadorId: idDePrueba<'Usuario'>(),
    montoTotal: 90_000,
    claveDeIdempotencia: 'clave-de-prueba-1',
    ahora: AHORA,
    ...cambios,
  });

describe('Pago de un servicio', () => {
  it('nace pendiente, con el desglose y una clave que sale del servicio', () => {
    const pago = servicio({
      servicioId: '0198aaaa-0000-7000-8000-000000000001',
    });

    expect(pago).toMatchObject({
      concepto: 'servicio',
      paqueteCodigo: null,
      estado: 'pendiente',
      medio: 'pasarela',
      montoTotal: 43_200,
      pagoProfesional: 36_000,
      ingresoPlataforma: 7_200,
      politicaVersion: 1,
      proveedor: null,
      referenciaProveedor: null,
      aprobadoEn: null,
      version: 1,
      versionLeida: 0,
      creadoEn: AHORA,
      claveDeIdempotencia: 'servicio:0198aaaa-0000-7000-8000-000000000001',
    });
  });

  it('el mismo servicio siempre da la misma clave: confirmarlo dos veces no cobra dos veces', () => {
    const servicioId = idDePrueba<'Servicio'>();

    expect(servicio({ servicioId }).claveDeIdempotencia).toBe(
      servicio({ servicioId }).claveDeIdempotencia,
    );
  });

  it('lo que no es del cuidador es de la plataforma, hasta el último peso', () => {
    const pago = servicio({ montoTotal: 100_001, pagoProfesional: 60_001 });

    expect(pago.pagoProfesional! + pago.ingresoPlataforma!).toBe(100_001);
  });

  it.each([
    [
      'un monto en cero',
      { montoTotal: 0, pagoProfesional: 0 },
      'pago.monto_invalido',
    ],
    ['un monto negativo', { montoTotal: -1 }, 'pago.monto_invalido'],
    ['un monto con decimales', { montoTotal: 43_200.5 }, 'pago.monto_invalido'],
    [
      'un monto que no es número',
      { montoTotal: Number.NaN },
      'pago.monto_invalido',
    ],
    [
      'un pago al cuidador negativo',
      { pagoProfesional: -1 },
      'pago.desglose_incoherente',
    ],
    [
      'un pago al cuidador mayor que el total',
      { pagoProfesional: 43_201 },
      'pago.desglose_incoherente',
    ],
    [
      'un pago al cuidador con decimales',
      { pagoProfesional: 100.5 },
      'pago.desglose_incoherente',
    ],
    [
      'una política en cero',
      { politicaVersion: 0 },
      'pago.desglose_incoherente',
    ],
  ])('rechaza %s', (_caso, cambios, codigo) => {
    expect(() => servicio(cambios)).toThrow(
      expect.objectContaining({
        constructor: ErrorDeValidacion,
        codigo,
      }) as Error,
    );
  });

  it('acepta que el cuidador no reciba nada (un servicio gratuito para él no existe, pero el dinero cuadra)', () => {
    expect(servicio({ pagoProfesional: 0 }).ingresoPlataforma).toBe(43_200);
  });
});

describe('Pago de una bolsa', () => {
  it('nace pendiente, siempre con la pasarela y sin desglose', () => {
    const pago = bolsa();

    expect(pago).toMatchObject({
      concepto: 'bolsa',
      servicioId: null,
      paqueteCodigo: 'bolsa-20',
      medio: 'pasarela',
      montoTotal: 90_000,
      pagoProfesional: null,
      ingresoPlataforma: null,
      politicaVersion: null,
      estado: 'pendiente',
      claveDeIdempotencia: 'clave-de-prueba-1',
    });
  });

  it.each(['corta', 'con espacios no valen', 'a'.repeat(101), 'raro/ñ-1234'])(
    'rechaza la clave «%s»',
    (clave) => {
      expect(() => bolsa({ claveDeIdempotencia: clave })).toThrow(
        expect.objectContaining({ codigo: 'pago.clave_invalida' }) as Error,
      );
    },
  );

  it('rechaza un monto en cero', () => {
    expect(() => bolsa({ montoTotal: 0 })).toThrow(ErrorDeValidacion);
  });
});

describe('estados del pago', () => {
  it('aprobar lo deja aprobado, con la hora, y sube la versión', () => {
    const pago = servicio();

    pago.aprobar(MAS_TARDE);

    expect(pago).toMatchObject({
      estado: 'aprobado',
      aprobadoEn: MAS_TARDE,
      version: 2,
      actualizadoEn: MAS_TARDE,
    });
  });

  it('rechazarlo y vencerlo lo cierran sin fecha de aprobación', () => {
    const rechazado = servicio();
    const vencido = servicio();

    rechazado.rechazar(MAS_TARDE);
    vencido.expirar(MAS_TARDE);

    expect(rechazado).toMatchObject({ estado: 'rechazado', aprobadoEn: null });
    expect(vencido).toMatchObject({ estado: 'expirado', aprobadoEn: null });
  });

  it('un pago aprobado se puede reembolsar, y conserva cuándo se aprobó', () => {
    const pago = servicio();
    pago.aprobar(AHORA);

    pago.reembolsar(MAS_TARDE);

    expect(pago).toMatchObject({
      estado: 'reembolsado',
      aprobadoEn: AHORA,
      version: 3,
    });
  });

  it.each(['rechazar', 'expirar', 'aprobar'] as const)(
    'un pago ya aprobado no se puede %s',
    (accion) => {
      const pago = servicio();
      pago.aprobar(AHORA);

      expect(() => pago[accion](MAS_TARDE)).toThrow(
        expect.objectContaining({
          constructor: ConflictoDeEstado,
          codigo: 'pago.transicion_invalida',
        }) as Error,
      );
      expect(pago.estado).toBe('aprobado');
      expect(pago.version).toBe(2);
    },
  );

  it.each(['rechazar', 'expirar'] as const)(
    'un pago cerrado con «%s» no se aprueba después',
    (cierre) => {
      const pago = servicio();
      pago[cierre](AHORA);

      expect(() => pago.aprobar(MAS_TARDE)).toThrow(ConflictoDeEstado);
      expect(pago.aprobadoEn).toBeNull();
    },
  );

  it.each(['pendiente', 'rechazado', 'expirado', 'reembolsado'] as const)(
    'un pago %s no se puede reembolsar',
    (estado) => {
      const pago = servicio();
      if (estado === 'rechazado') pago.rechazar(AHORA);
      if (estado === 'expirado') pago.expirar(AHORA);
      if (estado === 'reembolsado') {
        pago.aprobar(AHORA);
        pago.reembolsar(AHORA);
      }

      expect(() => pago.reembolsar(MAS_TARDE)).toThrow(
        expect.objectContaining({ codigo: 'pago.no_reembolsable' }) as Error,
      );
    },
  );

  it('conoce hasta cuándo se puede pagar', () => {
    expect(servicio().venceEn(30)).toEqual(
      new Date('2030-06-10T15:30:00.000Z'),
    );
  });

  it('solo está pendiente mientras nada lo resuelve', () => {
    const pago = servicio();
    expect(pago.estaPendiente()).toBe(true);

    pago.aprobar(AHORA);

    expect(pago.estaPendiente()).toBe(false);
  });
});

describe('la referencia de la pasarela', () => {
  it('se anota una vez y repetirla igual no cambia nada', () => {
    const pago = servicio();

    pago.asociarReferencia('simulada', 'sim_1', AHORA);
    const version = pago.version;
    pago.asociarReferencia('simulada', 'sim_1', MAS_TARDE);

    expect(pago).toMatchObject({
      proveedor: 'simulada',
      referenciaProveedor: 'sim_1',
      version,
    });
  });

  it.each([
    ['otra referencia', 'simulada', 'sim_2'],
    ['otro proveedor', 'otra', 'sim_1'],
  ])('no se puede cambiar por %s', (_caso, proveedor, referencia) => {
    const pago = servicio();
    pago.asociarReferencia('simulada', 'sim_1', AHORA);

    expect(() =>
      pago.asociarReferencia(proveedor, referencia, MAS_TARDE),
    ).toThrow(
      expect.objectContaining({
        constructor: ConflictoDeEstado,
        codigo: 'pago.referencia_distinta',
      }) as Error,
    );
    expect(pago.referenciaProveedor).toBe('sim_1');
  });

  it('solo se anota mientras el pago está pendiente', () => {
    const pago = servicio();
    pago.aprobar(AHORA);

    expect(() =>
      pago.asociarReferencia('simulada', 'sim_1', MAS_TARDE),
    ).toThrow(ConflictoDeEstado);
  });
});

describe('reconstruir', () => {
  it('un pago leído de la base recuerda con qué versión se leyó', () => {
    const original = servicio();
    original.aprobar(AHORA);

    const leido = Pago.reconstruir({
      id: original.id,
      concepto: original.concepto,
      servicioId: original.servicioId,
      paqueteCodigo: original.paqueteCodigo,
      pagadorId: original.pagadorId,
      medio: original.medio,
      montoTotal: original.montoTotal,
      pagoProfesional: original.pagoProfesional,
      ingresoPlataforma: original.ingresoPlataforma,
      politicaVersion: original.politicaVersion,
      estado: original.estado,
      proveedor: original.proveedor,
      referenciaProveedor: original.referenciaProveedor,
      claveDeIdempotencia: original.claveDeIdempotencia,
      aprobadoEn: original.aprobadoEn,
      version: original.version,
      creadoEn: original.creadoEn,
      actualizadoEn: original.actualizadoEn,
    });

    expect(leido.versionLeida).toBe(2);
    leido.reembolsar(MAS_TARDE);
    expect(leido.version).toBe(3);
    expect(leido.versionLeida).toBe(2);
  });
});
