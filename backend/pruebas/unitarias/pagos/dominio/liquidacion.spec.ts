import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../../../src/compartido/dominio/errores.js';
import type { LiquidacionId } from '../../../../src/pagos/dominio/ids.js';
import {
  Liquidacion,
  type EstadoDeLiquidacion,
} from '../../../../src/pagos/dominio/liquidacion.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const AHORA = new Date('2030-06-10T15:00:00.000Z');
const MAS_TARDE = new Date('2030-06-10T18:00:00.000Z');

const nueva = (monto = 36_000) =>
  Liquidacion.crear({
    id: idDePrueba<'Liquidacion'>() as LiquidacionId,
    cuidadorId: idDePrueba<'Cuidador'>(),
    servicioId: idDePrueba<'Servicio'>(),
    monto,
    ahora: AHORA,
  });

// Una liquidación llevada a `estado` por el camino válido.
function en(estado: EstadoDeLiquidacion): Liquidacion {
  const liquidacion = nueva();
  if (estado === 'enviada') liquidacion.registrarEnvio('ref');
  if (estado === 'pagada') liquidacion.registrarPago('ref', MAS_TARDE);
  if (estado === 'fallida') liquidacion.fallar();
  return liquidacion;
}

describe('Liquidacion', () => {
  it('nace pendiente, sin referencia ni fecha de pago', () => {
    expect(nueva()).toMatchObject({
      monto: 36_000,
      estado: 'pendiente',
      referenciaDispersion: null,
      pagadaEn: null,
      creadaEn: AHORA,
    });
  });

  it.each([0, -1, 10.5, Number.NaN])('rechaza el monto %s', (monto) => {
    expect(() => nueva(monto)).toThrow(
      expect.objectContaining({
        constructor: ErrorDeValidacion,
        codigo: 'liquidacion.monto_invalido',
      }) as Error,
    );
  });

  it('el dispersor puede pagar en el mismo acto', () => {
    const liquidacion = nueva();

    liquidacion.registrarPago('banco-1', MAS_TARDE);

    expect(liquidacion).toMatchObject({
      estado: 'pagada',
      referenciaDispersion: 'banco-1',
      pagadaEn: MAS_TARDE,
    });
  });

  it('o recibir la orden y pagar después', () => {
    const liquidacion = nueva();

    liquidacion.registrarEnvio('banco-1');
    expect(liquidacion).toMatchObject({
      estado: 'enviada',
      referenciaDispersion: 'banco-1',
      pagadaEn: null,
    });
    liquidacion.registrarPago('banco-1', MAS_TARDE);

    expect(liquidacion).toMatchObject({
      estado: 'pagada',
      pagadaEn: MAS_TARDE,
    });
  });

  it('una enviada puede fallar, y una fallida se puede reintentar desde cero', () => {
    const liquidacion = en('enviada');

    liquidacion.fallar();
    expect(liquidacion.estado).toBe('fallida');
    liquidacion.reintentar();

    expect(liquidacion).toMatchObject({
      estado: 'pendiente',
      referenciaDispersion: null,
    });
  });

  it.each([
    ['enviar', ['enviada', 'pagada', 'fallida'] as const],
    ['reintentar', ['pendiente', 'enviada', 'pagada'] as const],
  ])('no se puede %s desde un estado que no corresponde', (accion, estados) => {
    for (const estado of estados) {
      const liquidacion = en(estado);
      const intentar = () =>
        accion === 'enviar'
          ? liquidacion.registrarEnvio('otra')
          : liquidacion.reintentar();

      expect(intentar).toThrow(
        expect.objectContaining({
          constructor: ConflictoDeEstado,
          codigo: 'liquidacion.transicion_invalida',
        }) as Error,
      );
      expect(liquidacion.estado).toBe(estado);
    }
  });

  it.each(['pagada', 'fallida'] as const)(
    'una liquidación %s no se paga ni falla otra vez',
    (estado) => {
      const liquidacion = en(estado);

      expect(() => liquidacion.registrarPago('x', MAS_TARDE)).toThrow(
        ConflictoDeEstado,
      );
      expect(() => liquidacion.fallar()).toThrow(ConflictoDeEstado);
      expect(liquidacion.estado).toBe(estado);
    },
  );

  it('una leída de la base conserva todos sus datos', () => {
    const original = en('pagada');

    const leida = Liquidacion.reconstruir({
      id: original.id,
      cuidadorId: original.cuidadorId,
      servicioId: original.servicioId,
      monto: original.monto,
      estado: original.estado,
      referenciaDispersion: original.referenciaDispersion,
      creadaEn: original.creadaEn,
      pagadaEn: original.pagadaEn,
    });

    expect(leida).toMatchObject({
      estado: 'pagada',
      referenciaDispersion: 'ref',
      pagadaEn: MAS_TARDE,
      monto: 36_000,
    });
  });
});
