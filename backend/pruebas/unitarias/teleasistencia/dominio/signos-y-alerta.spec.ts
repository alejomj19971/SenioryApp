import fc from 'fast-check';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../../../src/compartido/dominio/errores.js';
import {
  Alerta,
  type AlertaId,
} from '../../../../src/teleasistencia/dominio/alerta.js';
import {
  DIAS_MAXIMOS_HACIA_ATRAS,
  estaFueraDeRango,
  LecturaDeSignos,
  RANGOS_POR_DEFECTO,
  validarRangos,
  type LecturaId,
  type RangosDeReferencia,
} from '../../../../src/teleasistencia/dominio/signos.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const AHORA = new Date('2026-10-21T15:00:00.000Z');
const PERSONA = '0198aaaa-0000-7000-8000-0000000000a1';
const USUARIO = '0198aaaa-0000-7000-8000-0000000000f1';

function lectura(
  cambios: Record<string, unknown> = {},
  rangos = RANGOS_POR_DEFECTO,
) {
  return LecturaDeSignos.registrar({
    id: idDePrueba<'Lectura'>() as LecturaId,
    adultoMayorId: PERSONA,
    tomadaEn: AHORA,
    presionSistolica: 120,
    presionDiastolica: 80,
    fuente: 'manual',
    registradaPor: USUARIO,
    rangos,
    ahora: AHORA,
    ...cambios,
  });
}

const rechazo = (codigo: string) =>
  expect.objectContaining({ constructor: ErrorDeValidacion, codigo }) as Error;

describe('LecturaDeSignos', () => {
  describe('registrar', () => {
    it('guarda las medidas, quién la registró y la fuente', () => {
      const l = lectura({ frecuenciaCardiaca: 72, glucosa: 95 });

      expect(l).toMatchObject({
        presionSistolica: 120,
        presionDiastolica: 80,
        frecuenciaCardiaca: 72,
        glucosa: 95,
        fuente: 'manual',
        registradaPor: USUARIO,
        fueraDeRango: false,
        creadaEn: AHORA,
      });
    });

    it('las medidas son opcionales: solo la presión, solo la glucosa o solo el pulso (H8)', () => {
      expect(() => lectura()).not.toThrow();
      expect(() =>
        lectura({
          presionSistolica: null,
          presionDiastolica: null,
          glucosa: 100,
        }),
      ).not.toThrow();
      expect(() =>
        lectura({
          presionSistolica: null,
          presionDiastolica: null,
          frecuenciaCardiaca: 70,
        }),
      ).not.toThrow();
    });

    it('exige al menos una medida', () => {
      expect(() =>
        lectura({ presionSistolica: null, presionDiastolica: null }),
      ).toThrow(rechazo('lectura.sin_medidas'));
    });

    it('la presión va completa o no va', () => {
      expect(() => lectura({ presionDiastolica: null, glucosa: 90 })).toThrow(
        rechazo('lectura.presion_incompleta'),
      );
      expect(() => lectura({ presionSistolica: null, glucosa: 90 })).toThrow(
        rechazo('lectura.presion_incompleta'),
      );
    });

    it('la diastólica es menor que la sistólica', () => {
      for (const diastolica of [120, 130]) {
        expect(() => lectura({ presionDiastolica: diastolica })).toThrow(
          rechazo('lectura.presion_incoherente'),
        );
      }
    });

    describe('valores plausibles (errores de digitación, no condiciones clínicas)', () => {
      it.each([
        ['presionSistolica', 49],
        ['presionSistolica', 261],
        ['presionDiastolica', 29],
        ['presionDiastolica', 161],
        ['frecuenciaCardiaca', 19],
        ['frecuenciaCardiaca', 251],
        ['glucosa', 19],
        ['glucosa', 601],
        ['glucosa', 95.5],
        ['frecuenciaCardiaca', Number.NaN],
      ])('rechaza %s = %s', (campo, valor) => {
        expect(() =>
          lectura({ glucosa: 90, frecuenciaCardiaca: 70, [campo]: valor }),
        ).toThrow(rechazo('lectura.valor_implausible'));
      });

      it.each([
        ['presionSistolica', 50, { presionDiastolica: 30 }],
        ['presionSistolica', 260, {}],
        ['presionDiastolica', 30, { presionSistolica: 100 }],
        ['presionDiastolica', 160, { presionSistolica: 260 }],
        ['frecuenciaCardiaca', 20, {}],
        ['frecuenciaCardiaca', 250, {}],
        ['glucosa', 20, {}],
        ['glucosa', 600, {}],
      ])('acepta los extremos: %s = %s', (campo, valor, extra) => {
        expect(() => lectura({ [campo]: valor, ...extra })).not.toThrow();
      });
    });

    describe('el momento de la medición', () => {
      it('no puede ser del futuro, con un margen de 5 minutos por el reloj del dispositivo', () => {
        const en = (minutos: number) =>
          new Date(AHORA.getTime() + minutos * 60_000);

        expect(() => lectura({ tomadaEn: en(5) })).not.toThrow();
        expect(() => lectura({ tomadaEn: en(6) })).toThrow(
          rechazo('lectura.del_futuro'),
        );
      });

      it(`no puede tener más de ${DIAS_MAXIMOS_HACIA_ATRAS} días`, () => {
        const hace = (dias: number) =>
          new Date(AHORA.getTime() - dias * 86_400_000);

        expect(() =>
          lectura({ tomadaEn: hace(DIAS_MAXIMOS_HACIA_ATRAS) }),
        ).not.toThrow();
        expect(() =>
          lectura({ tomadaEn: hace(DIAS_MAXIMOS_HACIA_ATRAS + 1) }),
        ).toThrow(rechazo('lectura.muy_antigua'));
      });

      it('una fecha inválida', () => {
        expect(() => lectura({ tomadaEn: new Date('nada') })).toThrow(
          rechazo('lectura.fecha_invalida'),
        );
      });
    });
  });

  describe('fuera de rango', () => {
    it.each([
      [
        'presión sistólica alta',
        { presionSistolica: 141, presionDiastolica: 80 },
      ],
      [
        'presión sistólica baja',
        { presionSistolica: 89, presionDiastolica: 60 },
      ],
      [
        'presión diastólica alta',
        { presionSistolica: 130, presionDiastolica: 91 },
      ],
      [
        'presión diastólica baja',
        { presionSistolica: 100, presionDiastolica: 59 },
      ],
      ['pulso alto', { frecuenciaCardiaca: 101 }],
      ['pulso bajo', { frecuenciaCardiaca: 49 }],
      ['glucosa alta', { glucosa: 181 }],
      ['glucosa baja', { glucosa: 69 }],
    ])('%s', (_nombre, medidas) => {
      expect(lectura(medidas).fueraDeRango).toBe(true);
    });

    it.each([
      [
        'los límites exactos de presión',
        { presionSistolica: 140, presionDiastolica: 90 },
      ],
      [
        'el límite bajo exacto',
        { presionSistolica: 90, presionDiastolica: 60 },
      ],
      ['el pulso en el límite', { frecuenciaCardiaca: 100 }],
      ['la glucosa en el límite', { glucosa: 70 }],
    ])('está dentro con %s', (_nombre, medidas) => {
      expect(lectura(medidas).fueraDeRango).toBe(false);
    });

    it('una sola medida fuera basta aunque las demás estén bien', () => {
      expect(
        lectura({ frecuenciaCardiaca: 70, glucosa: 300 }).fueraDeRango,
      ).toBe(true);
    });

    it('usa los rangos de la persona, no los generales', () => {
      const suyos: RangosDeReferencia = {
        ...RANGOS_POR_DEFECTO,
        sistolicaMax: 160,
        diastolicaMax: 100,
      };

      expect(
        lectura({ presionSistolica: 150, presionDiastolica: 95 }, suyos)
          .fueraDeRango,
      ).toBe(false);
      expect(
        lectura({ presionSistolica: 150, presionDiastolica: 95 }).fueraDeRango,
      ).toBe(true);
    });

    it('un extremo sin definir no cuenta por ese lado', () => {
      const soloMaximo: RangosDeReferencia = {
        sistolicaMin: null,
        sistolicaMax: 140,
        diastolicaMin: null,
        diastolicaMax: null,
        frecuenciaMin: null,
        frecuenciaMax: null,
        glucosaMin: null,
        glucosaMax: null,
      };

      expect(
        lectura({ presionSistolica: 60, presionDiastolica: 40 }, soloMaximo)
          .fueraDeRango,
      ).toBe(false);
      expect(
        lectura({ presionSistolica: 150, presionDiastolica: 40 }, soloMaximo)
          .fueraDeRango,
      ).toBe(true);
    });

    it('una medida que no se tomó no se evalúa', () => {
      const sinNada = estaFueraDeRango(
        { sistolica: null, diastolica: null, frecuencia: null, glucosa: null },
        RANGOS_POR_DEFECTO,
      );

      expect(sinNada).toBe(false);
    });

    it('propiedad: dentro de los rangos por defecto nunca marca fuera de rango', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 139 }),
          fc.integer({ min: 61, max: 89 }),
          fc.integer({ min: 51, max: 99 }),
          fc.integer({ min: 71, max: 179 }),
          (sis, dia, fc_, glu) => {
            expect(
              lectura({
                presionSistolica: sis,
                presionDiastolica: dia,
                frecuenciaCardiaca: fc_,
                glucosa: glu,
              }).fueraDeRango,
            ).toBe(false);
          },
        ),
      );
    });
  });
});

describe('validarRangos', () => {
  it('acepta los rangos por defecto y devuelve una copia', () => {
    const copia = validarRangos(RANGOS_POR_DEFECTO);

    expect(copia).toEqual(RANGOS_POR_DEFECTO);
    expect(copia).not.toBe(RANGOS_POR_DEFECTO);
  });

  it('acepta rangos con extremos sin definir', () => {
    expect(() =>
      validarRangos({
        ...RANGOS_POR_DEFECTO,
        glucosaMin: null,
        glucosaMax: null,
      }),
    ).not.toThrow();
  });

  it.each(['sistolica', 'diastolica', 'frecuencia', 'glucosa'])(
    'el mínimo de %s no puede igualar ni pasar al máximo',
    (medida) => {
      for (const [min, max] of [
        [100, 100],
        [120, 100],
      ]) {
        expect(() =>
          validarRangos({
            ...RANGOS_POR_DEFECTO,
            [`${medida}Min`]: min,
            [`${medida}Max`]: max,
          }),
        ).toThrow(rechazo('rangos.minimo_mayor_que_maximo'));
      }
    },
  );

  it.each([0, -5, 1.5, Number.NaN])('rechaza el límite %s', (valor) => {
    expect(() =>
      validarRangos({ ...RANGOS_POR_DEFECTO, sistolicaMax: valor }),
    ).toThrow(rechazo('rangos.limite_invalido'));
  });
});

describe('Alerta', () => {
  const alerta = (cambios: Record<string, unknown> = {}) =>
    Alerta.generar({
      id: idDePrueba<'Alerta'>() as AlertaId,
      adultoMayorId: PERSONA,
      origen: 'boton',
      generadaPor: USUARIO,
      claveDeIdempotencia: 'clave-de-prueba-1',
      ahora: AHORA,
      ...cambios,
    });
  const despues = (segundos: number) =>
    new Date(AHORA.getTime() + segundos * 1000);

  it('nace generada, abierta y sin entregas', () => {
    const a = alerta();

    expect(a).toMatchObject({
      estado: 'generada',
      origen: 'boton',
      generadaPor: USUARIO,
      generadaEn: AHORA,
      primeraEntregaEn: null,
      atendidaPor: null,
      atendidaEn: null,
      nota: null,
    });
    expect(a.estaAbierta()).toBe(true);
  });

  it.each(['corta', '', 'con espacios no vale', 'x'.repeat(101)])(
    'rechaza la clave de idempotencia %j',
    (clave) => {
      expect(() => alerta({ claveDeIdempotencia: clave })).toThrow(
        rechazo('alerta.clave_invalida'),
      );
    },
  );

  describe('registrarEntrega (E11)', () => {
    it('la primera entrega la pasa a «notificada» y guarda cuándo', () => {
      const a = alerta();

      const cambio = a.registrarEntrega(despues(3));

      expect(cambio).toBe(true);
      expect(a).toMatchObject({
        estado: 'notificada',
        primeraEntregaEn: despues(3),
      });
      expect(a.estaAbierta()).toBe(true);
    });

    it('solo cuenta la primera: las siguientes no cambian nada', () => {
      const a = alerta();
      a.registrarEntrega(despues(3));

      const cambio = a.registrarEntrega(despues(9));

      expect(cambio).toBe(false);
      expect(a.primeraEntregaEn).toEqual(despues(3));
    });

    it('un reloj atrasado no deja la entrega antes de la generación', () => {
      const a = alerta();

      a.registrarEntrega(despues(-5));

      expect(a.primeraEntregaEn).toEqual(AHORA);
    });

    it('si ya la atendieron, el aviso tardío no la devuelve a «notificada»', () => {
      const a = alerta();
      a.atender(USUARIO, despues(2));

      a.registrarEntrega(despues(4));

      expect(a.estado).toBe('atendida');
      expect(a.primeraEntregaEn).toEqual(despues(4));
    });
  });

  describe('atender', () => {
    it.each(['generada', 'notificada'] as const)(
      'una alerta %s se atiende',
      (estado) => {
        const a = alerta();
        if (estado === 'notificada') a.registrarEntrega(despues(1));

        a.atender(USUARIO, despues(30), '  Ya hablé con ella  ');

        expect(a).toMatchObject({
          estado: 'atendida',
          atendidaPor: USUARIO,
          atendidaEn: despues(30),
          nota: 'Ya hablé con ella',
        });
        expect(a.estaAbierta()).toBe(false);
      },
    );

    it('la nota es opcional', () => {
      const a = alerta();

      a.atender(USUARIO, despues(1));

      expect(a.nota).toBeNull();
    });

    it('no se atiende dos veces', () => {
      const a = alerta();
      a.atender(USUARIO, despues(1));

      expect(() => a.atender(USUARIO, despues(2))).toThrow(
        expect.objectContaining({
          constructor: ConflictoDeEstado,
          codigo: 'alerta.ya_atendida',
        }) as Error,
      );
      expect(a.atendidaEn).toEqual(despues(1));
    });

    it('una nota de más de 300 caracteres se rechaza', () => {
      expect(() =>
        alerta().atender(USUARIO, despues(1), 'a'.repeat(301)),
      ).toThrow(rechazo('alerta.nota_muy_larga'));
    });
  });
});
