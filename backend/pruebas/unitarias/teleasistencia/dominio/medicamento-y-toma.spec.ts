import fc from 'fast-check';
import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  ReglaDeNegocioIncumplida,
} from '../../../../src/compartido/dominio/errores.js';
import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import {
  diaDeLaSemana,
  horaDelDia,
  Medicamento,
  type MedicamentoId,
} from '../../../../src/teleasistencia/dominio/medicamento.js';
import {
  Toma,
  type TomaId,
} from '../../../../src/teleasistencia/dominio/toma.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const AHORA = new Date('2026-10-21T15:00:00.000Z');
const HOY = FechaCivil.desdeTexto('2026-10-21'); // miércoles
const PERSONA = '0198aaaa-0000-7000-8000-0000000000a1';
const USUARIO = '0198aaaa-0000-7000-8000-0000000000f1';

function medicamento(cambios: Record<string, unknown> = {}) {
  return Medicamento.registrar({
    id: idDePrueba<'Medicamento'>() as MedicamentoId,
    adultoMayorId: PERSONA,
    nombre: 'Losartán',
    dosis: '50 mg',
    horarios: ['08:00', '20:00'],
    vigenteDesde: HOY,
    creadoPor: USUARIO,
    ahora: AHORA,
    ...cambios,
  });
}

function toma(fecha = HOY, hora = '08:00') {
  return Toma.crear({
    id: idDePrueba<'Toma'>() as TomaId,
    medicamentoId: idDePrueba<'Medicamento'>() as MedicamentoId,
    adultoMayorId: PERSONA,
    fecha,
    horaProgramada: horaDelDia(hora),
    ahora: AHORA,
  });
}

describe('horaDelDia', () => {
  it.each(['00:00', '08:05', '12:30', '23:59'])('acepta %s', (hora) => {
    expect(horaDelDia(hora)).toBe(hora);
  });

  it('descarta los segundos que entrega Postgres', () => {
    expect(horaDelDia('08:00:00')).toBe('08:00');
  });

  it.each(['24:00', '8:00', '08:60', '0800', '', 'ocho', '08:00 pm', '-1:00'])(
    'rechaza %j',
    (hora) => {
      expect(() => horaDelDia(hora)).toThrow(
        expect.objectContaining({
          constructor: ErrorDeValidacion,
          codigo: 'medicamento.hora_invalida',
        }) as Error,
      );
    },
  );
});

describe('diaDeLaSemana', () => {
  it.each([
    ['2026-10-19', 1], // lunes
    ['2026-10-21', 3], // miércoles
    ['2026-10-25', 7], // domingo
    ['2026-10-26', 1],
  ])('%s → %s', (fecha, esperado) => {
    expect(diaDeLaSemana(FechaCivil.desdeTexto(fecha))).toBe(esperado);
  });
});

describe('Medicamento', () => {
  describe('registrar', () => {
    it('guarda el plan: nombre, dosis, horarios ordenados y todos los días por defecto', () => {
      const m = medicamento({ horarios: ['20:00', '08:00', '08:00'] });

      expect(m).toMatchObject({
        nombre: 'Losartán',
        dosis: '50 mg',
        indicaciones: null,
        horarios: ['08:00', '20:00'],
        diasDeLaSemana: [1, 2, 3, 4, 5, 6, 7],
        activo: true,
        vigenteHasta: null,
        creadoPor: USUARIO,
      });
    });

    it('limpia espacios y normaliza el texto', () => {
      const m = medicamento({
        nombre: '  Metformina   850  ',
        dosis: ' 1\ttableta ',
        indicaciones: '  Con el desayuno  ',
      });

      expect(m).toMatchObject({
        nombre: 'Metformina 850',
        dosis: '1 tableta',
        indicaciones: 'Con el desayuno',
      });
    });

    it('las indicaciones vacías quedan en null', () => {
      expect(medicamento({ indicaciones: '   ' }).indicaciones).toBeNull();
    });

    it.each([
      ['un nombre vacío', { nombre: '  ' }, 'medicamento.nombre_invalido'],
      [
        'un nombre de más de 150 caracteres',
        { nombre: 'a'.repeat(151) },
        'medicamento.nombre_invalido',
      ],
      ['una dosis vacía', { dosis: '' }, 'medicamento.dosis_invalido'],
      [
        'una dosis de más de 100 caracteres',
        { dosis: 'a'.repeat(101) },
        'medicamento.dosis_invalido',
      ],
      [
        'un carácter de control en el nombre',
        { nombre: 'Lo\u0000sartán' },
        'medicamento.nombre_invalido',
      ],
      [
        'un carácter que invierte la lectura',
        { nombre: 'Los‮artán' },
        'medicamento.nombre_invalido',
      ],
      [
        'indicaciones de más de 500 caracteres',
        { indicaciones: 'a'.repeat(501) },
        'medicamento.indicaciones_invalidas',
      ],
      ['sin horarios', { horarios: [] }, 'medicamento.horarios_invalidos'],
      [
        'más de 8 horarios',
        {
          horarios: [
            '01:00',
            '02:00',
            '03:00',
            '04:00',
            '05:00',
            '06:00',
            '07:00',
            '08:00',
            '09:00',
          ],
        },
        'medicamento.horarios_invalidos',
      ],
      [
        'un horario inventado',
        { horarios: ['25:00'] },
        'medicamento.hora_invalida',
      ],
      [
        'un día fuera de 1 a 7',
        { diasDeLaSemana: [0, 1] },
        'medicamento.dias_invalidos',
      ],
      [
        'un día con decimales',
        { diasDeLaSemana: [1.5] },
        'medicamento.dias_invalidos',
      ],
      ['ningún día', { diasDeLaSemana: [] }, 'medicamento.dias_invalidos'],
      [
        'terminar antes de empezar',
        { vigenteHasta: HOY.sumarDias(-1) },
        'medicamento.vigencia_invalida',
      ],
    ])('rechaza %s', (_nombre, cambios, codigo) => {
      expect(() => medicamento(cambios)).toThrow(
        expect.objectContaining({
          constructor: ErrorDeValidacion,
          codigo,
        }) as Error,
      );
    });

    it('puede terminar el mismo día que empieza', () => {
      expect(() => medicamento({ vigenteHasta: HOY })).not.toThrow();
    });
  });

  describe('aplicaEl', () => {
    it('todos los días, dentro de su vigencia', () => {
      const m = medicamento();

      expect(m.aplicaEl(HOY)).toBe(true);
      expect(m.aplicaEl(HOY.sumarDias(400))).toBe(true);
    });

    it('no aplica antes de empezar', () => {
      expect(medicamento().aplicaEl(HOY.sumarDias(-1))).toBe(false);
    });

    it('aplica hasta el último día de su vigencia, inclusive', () => {
      const m = medicamento({ vigenteHasta: HOY.sumarDias(3) });

      expect(m.aplicaEl(HOY.sumarDias(3))).toBe(true);
      expect(m.aplicaEl(HOY.sumarDias(4))).toBe(false);
    });

    it('solo los días de la semana que le tocan', () => {
      // Lunes, miércoles y viernes.
      const m = medicamento({ diasDeLaSemana: [1, 3, 5] });

      const aplica = [0, 1, 2, 3, 4, 5, 6].map((d) =>
        m.aplicaEl(HOY.sumarDias(d)),
      );

      // miércoles 21 … martes 27
      expect(aplica).toEqual([true, false, true, false, false, true, false]);
    });

    it('desactivarlo lo saca de todos los días y deja la fecha del cambio', () => {
      const m = medicamento();
      const luego = new Date('2026-10-22T10:00:00.000Z');

      m.desactivar(luego);

      expect(m.activo).toBe(false);
      expect(m.actualizadoEn).toEqual(luego);
      expect(m.aplicaEl(HOY)).toBe(false);
    });

    it('propiedad: un medicamento diario aplica en cualquier día dentro de su vigencia', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 3650 }), (dias) => {
          expect(medicamento().aplicaEl(HOY.sumarDias(dias))).toBe(true);
        }),
      );
    });
  });
});

describe('Toma', () => {
  it('nace pendiente, de la versión 1 y sin quién la registró', () => {
    const t = toma();

    expect(t).toMatchObject({
      estado: 'pendiente',
      version: 1,
      registradaPor: null,
      registradaEn: null,
      horaProgramada: '08:00',
    });
    expect(t.versionLeidaDeLaBase).toBe(0);
  });

  describe('marcarTomada', () => {
    it('queda tomada, con quién y cuándo, y sube la versión', () => {
      const t = toma();

      t.marcarTomada(USUARIO, AHORA, HOY);

      expect(t).toMatchObject({
        estado: 'tomada',
        registradaPor: USUARIO,
        registradaEn: AHORA,
        version: 2,
      });
    });

    it('solo el día que corresponde: ni ayer ni mañana (H6)', () => {
      for (const fecha of [HOY.sumarDias(-1), HOY.sumarDias(1)]) {
        expect(() => toma(fecha).marcarTomada(USUARIO, AHORA, HOY)).toThrow(
          expect.objectContaining({
            constructor: ReglaDeNegocioIncumplida,
            codigo: 'toma.fuera_de_dia',
          }) as Error,
        );
      }
    });

    it('la toma de las 11:30 p. m. se marca ese día, aunque en UTC ya sea mañana', () => {
      // 23:30 en Bogotá del 21 son las 04:30Z del 22.
      const casiMedianoche = new Date('2026-10-22T04:30:00.000Z');
      const hoyEnColombia = FechaCivil.hoy(
        { ahora: () => casiMedianoche },
        'America/Bogota',
      );
      const t = toma(HOY, '23:30');

      expect(hoyEnColombia.aTexto()).toBe('2026-10-21');
      expect(() =>
        t.marcarTomada(USUARIO, casiMedianoche, hoyEnColombia),
      ).not.toThrow();
    });

    it('pasada la medianoche ya no se puede marcar la del día anterior', () => {
      const pasadaLaMedianoche = new Date('2026-10-22T05:30:00.000Z'); // 00:30 del 22 en Bogotá
      const hoyEnColombia = FechaCivil.hoy(
        { ahora: () => pasadaLaMedianoche },
        'America/Bogota',
      );

      expect(() =>
        toma(HOY, '23:30').marcarTomada(
          USUARIO,
          pasadaLaMedianoche,
          hoyEnColombia,
        ),
      ).toThrow(
        expect.objectContaining({ codigo: 'toma.fuera_de_dia' }) as Error,
      );
    });

    it('no se marca dos veces', () => {
      const t = toma();
      t.marcarTomada(USUARIO, AHORA, HOY);

      expect(() => t.marcarTomada(USUARIO, AHORA, HOY)).toThrow(
        expect.objectContaining({
          constructor: ConflictoDeEstado,
          codigo: 'toma.ya_tomada',
        }) as Error,
      );
    });

    it('una omitida que sí se tomó, tarde pero el mismo día, se puede registrar', () => {
      const t = toma();
      t.omitir();

      t.marcarTomada(USUARIO, AHORA, HOY);

      expect(t.estado).toBe('tomada');
    });
  });

  describe('desmarcar', () => {
    it('vuelve a pendiente y borra quién y cuándo', () => {
      const t = toma();
      t.marcarTomada(USUARIO, AHORA, HOY);

      t.desmarcar(HOY);

      expect(t).toMatchObject({
        estado: 'pendiente',
        registradaPor: null,
        registradaEn: null,
        version: 3,
      });
    });

    it('solo se deshace una tomada', () => {
      for (const t of [
        toma(),
        (() => {
          const o = toma();
          o.omitir();
          return o;
        })(),
      ]) {
        expect(() => t.desmarcar(HOY)).toThrow(
          expect.objectContaining({ codigo: 'toma.no_esta_tomada' }) as Error,
        );
      }
    });

    it('solo el día que corresponde', () => {
      const t = toma(HOY.sumarDias(-1));

      expect(() => t.desmarcar(HOY)).toThrow(
        expect.objectContaining({ codigo: 'toma.fuera_de_dia' }) as Error,
      );
    });
  });

  describe('omitir', () => {
    it('una pendiente pasa a omitida', () => {
      const t = toma();

      t.omitir();

      expect(t).toMatchObject({ estado: 'omitida', version: 2 });
    });

    it.each(['tomada', 'omitida'] as const)('una %s no se omite', (estado) => {
      const t = toma();
      if (estado === 'tomada') t.marcarTomada(USUARIO, AHORA, HOY);
      else t.omitir();

      expect(() => t.omitir()).toThrow(
        expect.objectContaining({ codigo: 'toma.no_pendiente' }) as Error,
      );
    });
  });

  it('una toma leída de la base recuerda con qué versión se leyó', () => {
    const original = toma();
    const leida = Toma.reconstruir({
      id: original.id,
      medicamentoId: original.medicamentoId,
      adultoMayorId: PERSONA,
      fecha: HOY,
      horaProgramada: horaDelDia('08:00'),
      estado: 'pendiente',
      registradaPor: null,
      registradaEn: null,
      version: 4,
      creadaEn: AHORA,
    });

    leida.marcarTomada(USUARIO, AHORA, HOY);

    expect(leida.versionLeidaDeLaBase).toBe(4);
    expect(leida.version).toBe(5);
  });
});
