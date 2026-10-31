import fc from 'fast-check';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  ReglaDeNegocioIncumplida,
} from '../../../../src/compartido/dominio/errores.js';
import {
  Bolsa,
  situacionDeReserva,
  type MovimientoDeBolsa,
} from '../../../../src/pagos/dominio/bolsa.js';
import type {
  BolsaId,
  MovimientoDeBolsaId,
} from '../../../../src/pagos/dominio/ids.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const AHORA = new Date('2030-06-10T15:00:00.000Z');
const FAMILIAR = '0198aaaa-0000-7000-8000-0000000000f1';
const PAGO = '0198aaaa-0000-7000-8000-0000000000b1';
const SERVICIO = '0198aaaa-0000-7000-8000-0000000000e1';

const id = () => idDePrueba<'MovimientoDeBolsa'>() as MovimientoDeBolsaId;
const nueva = () =>
  Bolsa.abrir(idDePrueba<'Bolsa'>() as BolsaId, FAMILIAR, AHORA);

// Una bolsa con `monto` ya acreditado.
function conSaldo(monto: number): Bolsa {
  const bolsa = nueva();
  bolsa.acreditar(monto, PAGO, id(), AHORA);
  return bolsa;
}

describe('Bolsa', () => {
  it('se abre en cero, sin movimientos', () => {
    const bolsa = nueva();

    expect(bolsa).toMatchObject({
      familiarId: FAMILIAR,
      saldoDisponible: 0,
      saldoReservado: 0,
      version: 1,
      versionLeida: 0,
      creadaEn: AHORA,
    });
    expect(bolsa.movimientosPendientes).toEqual([]);
  });

  describe('acreditar', () => {
    it('suma al disponible y deja el movimiento de la compra, con su pago', () => {
      const bolsa = nueva();

      bolsa.acreditar(100_000, PAGO, id(), AHORA);

      expect(bolsa.saldoDisponible).toBe(100_000);
      expect(bolsa.saldoReservado).toBe(0);
      expect(bolsa.version).toBe(2);
      expect(bolsa.movimientosPendientes).toMatchObject([
        {
          tipo: 'compra',
          deltaDisponible: 100_000,
          deltaReservado: 0,
          servicioId: null,
          pagoId: PAGO,
          bolsaId: bolsa.id,
          creadoEn: AHORA,
        },
      ]);
    });
  });

  describe('reservar', () => {
    it('pasa el monto del disponible al reservado', () => {
      const bolsa = conSaldo(100_000);

      bolsa.reservar(43_200, SERVICIO, id(), AHORA);

      expect(bolsa).toMatchObject({
        saldoDisponible: 56_800,
        saldoReservado: 43_200,
      });
      expect(bolsa.movimientosPendientes.at(-1)).toMatchObject({
        tipo: 'reserva',
        deltaDisponible: -43_200,
        deltaReservado: 43_200,
        servicioId: SERVICIO,
        pagoId: null,
      });
    });

    it('puede apartar todo el saldo', () => {
      const bolsa = conSaldo(43_200);

      bolsa.reservar(43_200, SERVICIO, id(), AHORA);

      expect(bolsa).toMatchObject({
        saldoDisponible: 0,
        saldoReservado: 43_200,
      });
    });

    it('sin saldo suficiente no aparta nada ni deja rastro', () => {
      const bolsa = conSaldo(43_199);
      const version = bolsa.version;
      const movimientos = bolsa.movimientosPendientes.length;

      expect(() => bolsa.reservar(43_200, SERVICIO, id(), AHORA)).toThrow(
        expect.objectContaining({
          constructor: ReglaDeNegocioIncumplida,
          codigo: 'bolsa.saldo_insuficiente',
        }) as Error,
      );

      expect(bolsa).toMatchObject({
        saldoDisponible: 43_199,
        saldoReservado: 0,
        version,
      });
      expect(bolsa.movimientosPendientes).toHaveLength(movimientos);
    });

    it('no puede apartar lo que ya está apartado', () => {
      const bolsa = conSaldo(50_000);
      bolsa.reservar(43_200, SERVICIO, id(), AHORA);

      expect(() =>
        bolsa.reservar(43_200, 'otro-servicio', id(), AHORA),
      ).toThrow(ReglaDeNegocioIncumplida);
    });
  });

  describe('consumir', () => {
    it('gasta lo apartado y el disponible no cambia', () => {
      const bolsa = conSaldo(100_000);
      bolsa.reservar(43_200, SERVICIO, id(), AHORA);

      bolsa.consumir(43_200, SERVICIO, id(), AHORA);

      expect(bolsa).toMatchObject({
        saldoDisponible: 56_800,
        saldoReservado: 0,
      });
      expect(bolsa.movimientosPendientes.at(-1)).toMatchObject({
        tipo: 'consumo',
        deltaDisponible: 0,
        deltaReservado: -43_200,
      });
    });

    it('no puede gastar más de lo apartado', () => {
      const bolsa = conSaldo(100_000);
      bolsa.reservar(10_000, SERVICIO, id(), AHORA);

      expect(() => bolsa.consumir(10_001, SERVICIO, id(), AHORA)).toThrow(
        expect.objectContaining({
          constructor: ConflictoDeEstado,
          codigo: 'bolsa.reserva_inconsistente',
        }) as Error,
      );
      expect(bolsa.saldoReservado).toBe(10_000);
    });

    it('sin nada apartado no gasta nada', () => {
      expect(() => conSaldo(100).consumir(1, SERVICIO, id(), AHORA)).toThrow(
        ConflictoDeEstado,
      );
    });
  });

  describe('liberar', () => {
    it('devuelve lo apartado al disponible', () => {
      const bolsa = conSaldo(100_000);
      bolsa.reservar(43_200, SERVICIO, id(), AHORA);

      bolsa.liberar(43_200, SERVICIO, id(), AHORA);

      expect(bolsa).toMatchObject({
        saldoDisponible: 100_000,
        saldoReservado: 0,
      });
      expect(bolsa.movimientosPendientes.at(-1)).toMatchObject({
        tipo: 'liberacion',
        deltaDisponible: 43_200,
        deltaReservado: -43_200,
      });
    });

    it('no puede liberar más de lo apartado', () => {
      const bolsa = conSaldo(100_000);
      bolsa.reservar(1_000, SERVICIO, id(), AHORA);

      expect(() => bolsa.liberar(1_001, SERVICIO, id(), AHORA)).toThrow(
        ConflictoDeEstado,
      );
      expect(bolsa).toMatchObject({
        saldoDisponible: 99_000,
        saldoReservado: 1_000,
      });
    });
  });

  describe('montos', () => {
    it.each([
      ['cero', 0],
      ['negativo', -5],
      ['con decimales', 10.5],
      ['que no es número', Number.NaN],
      ['infinito', Number.POSITIVE_INFINITY],
      ['demasiado grande', Number.MAX_SAFE_INTEGER + 1],
    ])('rechaza un monto %s en cada operación', (_caso, monto) => {
      const operaciones = [
        (b: Bolsa) => b.acreditar(monto, PAGO, id(), AHORA),
        (b: Bolsa) => b.reservar(monto, SERVICIO, id(), AHORA),
        (b: Bolsa) => b.consumir(monto, SERVICIO, id(), AHORA),
        (b: Bolsa) => b.liberar(monto, SERVICIO, id(), AHORA),
      ];

      for (const operar of operaciones) {
        const bolsa = conSaldo(100_000);
        bolsa.reservar(1_000, SERVICIO, id(), AHORA);
        const antes = {
          d: bolsa.saldoDisponible,
          r: bolsa.saldoReservado,
          m: bolsa.movimientosPendientes.length,
        };

        expect(() => operar(bolsa)).toThrow(
          expect.objectContaining({
            constructor: ErrorDeValidacion,
            codigo: 'bolsa.monto_invalido',
          }) as Error,
        );

        expect(bolsa.saldoDisponible).toBe(antes.d);
        expect(bolsa.saldoReservado).toBe(antes.r);
        expect(bolsa.movimientosPendientes).toHaveLength(antes.m);
      }
    });
  });

  it('una bolsa leída de la base recuerda con qué versión se leyó y no trae movimientos pendientes', () => {
    const leida = Bolsa.reconstruir({
      id: idDePrueba<'Bolsa'>() as BolsaId,
      familiarId: FAMILIAR,
      saldoDisponible: 5_000,
      saldoReservado: 1_000,
      version: 7,
      creadaEn: AHORA,
      actualizadaEn: AHORA,
    });

    expect(leida.versionLeida).toBe(7);
    expect(leida.movimientosPendientes).toEqual([]);
    leida.reservar(1_000, SERVICIO, id(), AHORA);
    expect(leida.version).toBe(8);
    expect(leida.versionLeida).toBe(7);
  });

  it('alcanzaPara compara con el disponible, no con el reservado', () => {
    const bolsa = conSaldo(10_000);
    bolsa.reservar(6_000, SERVICIO, id(), AHORA);

    expect(bolsa.alcanzaPara(4_000)).toBe(true);
    expect(bolsa.alcanzaPara(4_001)).toBe(false);
  });
});

describe('Bolsa: propiedades del libro', () => {
  type Operacion =
    | { tipo: 'acreditar'; monto: number }
    | { tipo: 'reservar'; monto: number; servicio: number }
    | { tipo: 'consumir'; servicio: number }
    | { tipo: 'liberar'; servicio: number };

  const operacion: fc.Arbitrary<Operacion> = fc.oneof(
    fc.record({
      tipo: fc.constant('acreditar' as const),
      monto: fc.integer({ min: 1, max: 500_000 }),
    }),
    fc.record({
      tipo: fc.constant('reservar' as const),
      monto: fc.integer({ min: 1, max: 200_000 }),
      servicio: fc.integer({ min: 0, max: 5 }),
    }),
    fc.record({
      tipo: fc.constant('consumir' as const),
      servicio: fc.integer({ min: 0, max: 5 }),
    }),
    fc.record({
      tipo: fc.constant('liberar' as const),
      servicio: fc.integer({ min: 0, max: 5 }),
    }),
  );

  // Hace las operaciones como lo harían los casos de uso: consumir y liberar usan lo que de verdad se apartó para
  // ese servicio, y un servicio solo se aparta, se consume o se libera una vez.
  function aplicar(operaciones: Operacion[]): {
    bolsa: Bolsa;
    acreditado: number;
    consumido: number;
  } {
    const bolsa = nueva();
    const apartado = new Map<number, number>();
    const cerrados = new Set<number>();
    let acreditado = 0;
    let consumido = 0;
    for (const paso of operaciones) {
      try {
        if (paso.tipo === 'acreditar') {
          bolsa.acreditar(paso.monto, PAGO, id(), AHORA);
          acreditado += paso.monto;
        } else if (paso.tipo === 'reservar') {
          if (apartado.has(paso.servicio) || cerrados.has(paso.servicio))
            continue;
          bolsa.reservar(paso.monto, `s${paso.servicio}`, id(), AHORA);
          apartado.set(paso.servicio, paso.monto);
        } else {
          const monto = apartado.get(paso.servicio);
          if (monto === undefined) continue;
          if (paso.tipo === 'consumir') {
            bolsa.consumir(monto, `s${paso.servicio}`, id(), AHORA);
            consumido += monto;
          } else {
            bolsa.liberar(monto, `s${paso.servicio}`, id(), AHORA);
          }
          apartado.delete(paso.servicio);
          cerrados.add(paso.servicio);
        }
      } catch (error) {
        // Una reserva sin saldo es lo único que puede fallar aquí.
        if (!(error instanceof ReglaDeNegocioIncumplida)) throw error;
      }
    }
    return { bolsa, acreditado, consumido };
  }

  it('los saldos nunca quedan negativos', () => {
    fc.assert(
      fc.property(fc.array(operacion, { maxLength: 40 }), (operaciones) => {
        const { bolsa } = aplicar(operaciones);

        return bolsa.saldoDisponible >= 0 && bolsa.saldoReservado >= 0;
      }),
    );
  });

  it('ningún peso se crea ni se pierde: disponible + reservado = acreditado − consumido', () => {
    fc.assert(
      fc.property(fc.array(operacion, { maxLength: 40 }), (operaciones) => {
        const { bolsa, acreditado, consumido } = aplicar(operaciones);

        return (
          bolsa.saldoDisponible + bolsa.saldoReservado ===
          acreditado - consumido
        );
      }),
    );
  });

  it('repetir el libro desde cero reproduce exactamente el saldo', () => {
    fc.assert(
      fc.property(fc.array(operacion, { maxLength: 40 }), (operaciones) => {
        const { bolsa } = aplicar(operaciones);

        const disponible = bolsa.movimientosPendientes.reduce(
          (suma, m) => suma + m.deltaDisponible,
          0,
        );
        const reservado = bolsa.movimientosPendientes.reduce(
          (suma, m) => suma + m.deltaReservado,
          0,
        );

        return (
          disponible === bolsa.saldoDisponible &&
          reservado === bolsa.saldoReservado
        );
      }),
    );
  });

  it('cada movimiento cumple las combinaciones que la base exige', () => {
    fc.assert(
      fc.property(fc.array(operacion, { maxLength: 40 }), (operaciones) => {
        const { bolsa } = aplicar(operaciones);

        return bolsa.movimientosPendientes.every((m) => {
          if (m.tipo === 'compra')
            return m.deltaDisponible > 0 && m.deltaReservado === 0;
          if (m.tipo === 'reserva') {
            return (
              m.deltaDisponible < 0 && m.deltaReservado === -m.deltaDisponible
            );
          }
          if (m.tipo === 'consumo')
            return m.deltaDisponible === 0 && m.deltaReservado < 0;
          if (m.tipo === 'liberacion') {
            return (
              m.deltaDisponible > 0 && m.deltaReservado === -m.deltaDisponible
            );
          }
          return false;
        });
      }),
    );
  });

  it('la versión sube una vez por cada movimiento', () => {
    fc.assert(
      fc.property(fc.array(operacion, { maxLength: 40 }), (operaciones) => {
        const { bolsa } = aplicar(operaciones);

        return bolsa.version === 1 + bolsa.movimientosPendientes.length;
      }),
    );
  });
});

describe('situacionDeReserva', () => {
  const movimiento = (
    tipo: MovimientoDeBolsa['tipo'],
    deltaDisponible: number,
    deltaReservado: number,
  ): MovimientoDeBolsa => ({
    id: id(),
    bolsaId: idDePrueba<'Bolsa'>() as BolsaId,
    tipo,
    deltaDisponible,
    deltaReservado,
    servicioId: SERVICIO,
    pagoId: null,
    creadoEn: AHORA,
  });

  it('sin movimientos no hay reserva', () => {
    expect(situacionDeReserva([])).toEqual({ situacion: 'sin_reserva' });
  });

  it('una reserva sola está apartada, con su monto', () => {
    expect(
      situacionDeReserva([movimiento('reserva', -43_200, 43_200)]),
    ).toEqual({
      situacion: 'reservada',
      monto: 43_200,
    });
  });

  it('una reserva seguida de un consumo está consumida', () => {
    expect(
      situacionDeReserva([
        movimiento('reserva', -43_200, 43_200),
        movimiento('consumo', 0, -43_200),
      ]),
    ).toEqual({ situacion: 'consumida' });
  });

  it('una reserva seguida de una liberación está liberada', () => {
    expect(
      situacionDeReserva([
        movimiento('reserva', -43_200, 43_200),
        movimiento('liberacion', 43_200, -43_200),
      ]),
    ).toEqual({ situacion: 'liberada' });
  });

  it('un consumo manda sobre una liberación (no debería haber las dos)', () => {
    expect(
      situacionDeReserva([
        movimiento('reserva', -10, 10),
        movimiento('liberacion', 10, -10),
        movimiento('consumo', 0, -10),
      ]),
    ).toEqual({ situacion: 'consumida' });
  });

  it('un movimiento suelto que no es reserva no cuenta como reserva', () => {
    expect(situacionDeReserva([movimiento('consumo', 0, -10)])).toEqual({
      situacion: 'sin_reserva',
    });
  });
});
