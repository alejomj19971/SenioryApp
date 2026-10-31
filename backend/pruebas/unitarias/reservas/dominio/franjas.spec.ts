import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import {
  franjaContiene,
  franjaYaTermino,
  HORARIOS_DE_FRANJA,
  minutosHastaElInicio,
  ventanaDeFranja,
} from '../../../../src/reservas/dominio/franjas.js';

const ZONA = 'America/Bogota';
const MIERCOLES = FechaCivil.desdeTexto('2026-10-21');

// Bogotá es UTC−5 todo el año: 08:00 allá son las 13:00Z.
const enBogota = (hora: string, dia = '2026-10-21') =>
  new Date(`${dia}T${hora}:00-05:00`);

describe('horarios de las franjas', () => {
  it('mañana 06–12, tarde 12–18, noche 18–06 (cruza la medianoche)', () => {
    expect(HORARIOS_DE_FRANJA).toEqual({
      manana: { inicio: 360, fin: 720 },
      tarde: { inicio: 720, fin: 1080 },
      noche: { inicio: 1080, fin: 1800 },
    });
  });

  it('la noche termina al día siguiente (más de 1440 minutos)', () => {
    const { inicio, fin } = ventanaDeFranja(MIERCOLES, 'noche');
    expect(fin - inicio).toBe(12 * 60);
    expect(HORARIOS_DE_FRANJA.noche.fin).toBeGreaterThan(1440);
  });
});

describe('franjaContiene', () => {
  it.each([
    ['05:59', 'manana', false],
    ['06:00', 'manana', true],
    ['11:59', 'manana', true],
    ['12:00', 'manana', false],
    ['12:00', 'tarde', true],
    ['17:59', 'tarde', true],
    ['18:00', 'tarde', false],
    ['18:00', 'noche', true],
    ['23:59', 'noche', true],
  ] as const)(
    'el 21 a las %s la franja «%s» → %s',
    (hora, jornada, esperado) => {
      expect(franjaContiene(MIERCOLES, jornada, enBogota(hora), ZONA)).toBe(
        esperado,
      );
    },
  );

  it('la noche del 21 sigue durante la madrugada del 22, hasta las 06:00', () => {
    const madrugada = (hora: string) => enBogota(hora, '2026-10-22');

    expect(franjaContiene(MIERCOLES, 'noche', madrugada('00:00'), ZONA)).toBe(
      true,
    );
    expect(franjaContiene(MIERCOLES, 'noche', madrugada('05:59'), ZONA)).toBe(
      true,
    );
    expect(franjaContiene(MIERCOLES, 'noche', madrugada('06:00'), ZONA)).toBe(
      false,
    );
  });

  it('la madrugada del 22 NO pertenece a la mañana del 22 ni a la noche del 22', () => {
    const jueves = FechaCivil.desdeTexto('2026-10-22');
    const madrugada = enBogota('03:00', '2026-10-22');

    expect(franjaContiene(jueves, 'manana', madrugada, ZONA)).toBe(false);
    expect(franjaContiene(jueves, 'noche', madrugada, ZONA)).toBe(false);
  });

  it('con margen, la franja se adelanta (para marcar el inicio)', () => {
    const antes = enBogota('05:35');

    expect(franjaContiene(MIERCOLES, 'manana', antes, ZONA)).toBe(false);
    expect(franjaContiene(MIERCOLES, 'manana', antes, ZONA, 30)).toBe(true);
    expect(
      franjaContiene(MIERCOLES, 'manana', enBogota('05:29'), ZONA, 30),
    ).toBe(false);
  });

  it('usa la hora de la zona, no la de UTC', () => {
    // 01:00Z del 22 es la 20:00 del 21 en Bogotá: sigue siendo la noche del 21 (y no la del 22).
    const instante = new Date('2026-10-22T01:00:00.000Z');

    expect(franjaContiene(MIERCOLES, 'noche', instante, ZONA)).toBe(true);
    expect(
      franjaContiene(
        FechaCivil.desdeTexto('2026-10-22'),
        'noche',
        instante,
        ZONA,
      ),
    ).toBe(false);
  });
});

describe('franjaYaTermino', () => {
  it('a las 8 p. m. de Colombia, la tarde de hoy ya terminó pero la noche no (H2)', () => {
    // 01:00Z del 22: en UTC ya es mañana, pero en Bogotá sigue siendo el 21.
    const ocho = new Date('2026-10-22T01:00:00.000Z');

    expect(franjaYaTermino(MIERCOLES, 'manana', ocho, ZONA)).toBe(true);
    expect(franjaYaTermino(MIERCOLES, 'tarde', ocho, ZONA)).toBe(true);
    expect(franjaYaTermino(MIERCOLES, 'noche', ocho, ZONA)).toBe(false);
  });

  it('a las 10 a. m. nada de hoy ha terminado salvo la mañana a medias', () => {
    const diez = enBogota('10:00');

    expect(franjaYaTermino(MIERCOLES, 'manana', diez, ZONA)).toBe(false);
    expect(franjaYaTermino(MIERCOLES, 'tarde', diez, ZONA)).toBe(false);
    expect(franjaYaTermino(MIERCOLES, 'noche', diez, ZONA)).toBe(false);
  });

  it('termina justo en la hora de fin', () => {
    expect(franjaYaTermino(MIERCOLES, 'manana', enBogota('11:59'), ZONA)).toBe(
      false,
    );
    expect(franjaYaTermino(MIERCOLES, 'manana', enBogota('12:00'), ZONA)).toBe(
      true,
    );
  });

  it('una fecha futura no ha terminado', () => {
    const viernes = FechaCivil.desdeTexto('2026-10-23');

    expect(franjaYaTermino(viernes, 'manana', enBogota('10:00'), ZONA)).toBe(
      false,
    );
  });

  it('una fecha pasada ya terminó', () => {
    const martes = FechaCivil.desdeTexto('2026-10-20');

    expect(franjaYaTermino(martes, 'noche', enBogota('10:00'), ZONA)).toBe(
      true,
    );
  });
});

describe('minutosHastaElInicio', () => {
  it('cuenta hacia adelante y hacia atrás', () => {
    expect(
      minutosHastaElInicio(MIERCOLES, 'tarde', enBogota('10:00'), ZONA),
    ).toBe(120);
    expect(
      minutosHastaElInicio(MIERCOLES, 'manana', enBogota('10:00'), ZONA),
    ).toBe(-240);
  });

  it('para mañana temprano cuenta más de un día de minutos', () => {
    const jueves = FechaCivil.desdeTexto('2026-10-22');

    expect(
      minutosHastaElInicio(jueves, 'manana', enBogota('10:00'), ZONA),
    ).toBe(20 * 60);
  });
});
