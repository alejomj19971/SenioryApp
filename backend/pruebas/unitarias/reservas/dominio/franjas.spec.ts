import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import {
  esHoraInicioValida,
  HORARIOS_DE_FRANJA,
  HORAS_INICIO_VALIDAS,
  jornadaDe,
  minutosLocales,
  ventanaContiene,
  ventanaDeServicio,
} from '../../../../src/reservas/dominio/franjas.js';

const ZONA = 'America/Bogota';
const MIERCOLES = FechaCivil.desdeTexto('2026-10-21');

// Bogotá es UTC−5 todo el año: 08:00 allá son las 13:00Z.
const enBogota = (hora: string, dia = '2026-10-21') =>
  new Date(`${dia}T${hora}:00-05:00`);

// Los mismos horarios de las antiguas franjas completas, expresados como (horaInicio, horas), para que las
// pruebas de ventana/contención de abajo sigan comprobando exactamente los mismos límites de siempre.
const MANANA = { horaInicio: 360, horas: 6 }; // 06:00–12:00
const TARDE = { horaInicio: 720, horas: 6 }; // 12:00–18:00
const NOCHE = { horaInicio: 1080, horas: 12 }; // 18:00–06:00 (cruza medianoche)

describe('horarios de las franjas (clasificación de la hora de inicio)', () => {
  it('mañana 06–12, tarde 12–18, noche 18–06 (cruza la medianoche)', () => {
    expect(HORARIOS_DE_FRANJA).toEqual({
      manana: { inicio: 360, fin: 720 },
      tarde: { inicio: 720, fin: 1080 },
      noche: { inicio: 1080, fin: 1800 },
    });
  });
});

describe('jornadaDe', () => {
  it.each([
    [0, 'noche'],
    [359, 'noche'],
    [360, 'manana'],
    [719, 'manana'],
    [720, 'tarde'],
    [1079, 'tarde'],
    [1080, 'noche'],
    [1410, 'noche'],
  ] as const)('%s minutos → %s', (minutos, esperada) => {
    expect(jornadaDe(minutos)).toBe(esperada);
  });
});

describe('esHoraInicioValida / HORAS_INICIO_VALIDAS', () => {
  it('hay 48 horas de inicio válidas, cada 30 minutos, de 00:00 a 23:30', () => {
    expect(HORAS_INICIO_VALIDAS).toHaveLength(48);
    expect(HORAS_INICIO_VALIDAS[0]).toBe(0);
    expect(HORAS_INICIO_VALIDAS.at(-1)).toBe(1410);
  });

  it.each([0, 30, 1410])('%s es válida', (minutos) => {
    expect(esHoraInicioValida(minutos)).toBe(true);
  });

  it.each([-1, 1440, 361, 1.5, Number.NaN])('%s no es válida', (minutos) => {
    expect(esHoraInicioValida(minutos)).toBe(false);
  });
});

describe('ventanaDeServicio / ventanaContiene', () => {
  it('la noche termina al día siguiente (más de 1440 minutos)', () => {
    const { inicio, fin } = ventanaDeServicio(MIERCOLES, NOCHE.horaInicio, NOCHE.horas);
    expect(fin - inicio).toBe(12 * 60);
    expect(fin).toBeGreaterThan(1440);
  });

  it.each([
    ['05:59', MANANA, false],
    ['06:00', MANANA, true],
    ['11:59', MANANA, true],
    ['12:00', MANANA, false],
    ['12:00', TARDE, true],
    ['17:59', TARDE, true],
    ['18:00', TARDE, false],
    ['18:00', NOCHE, true],
    ['23:59', NOCHE, true],
  ] as const)('el 21 a las %s la franja → %s', (hora, franja, esperado) => {
    const ventana = ventanaDeServicio(MIERCOLES, franja.horaInicio, franja.horas);
    const momento = minutosLocales(enBogota(hora), ZONA);
    expect(ventanaContiene(ventana, momento)).toBe(esperado);
  });

  it('la noche del 21 sigue durante la madrugada del 22, hasta las 06:00', () => {
    const madrugada = (hora: string) => enBogota(hora, '2026-10-22');
    const ventana = ventanaDeServicio(MIERCOLES, NOCHE.horaInicio, NOCHE.horas);

    expect(
      ventanaContiene(ventana, minutosLocales(madrugada('00:00'), ZONA)),
    ).toBe(true);
    expect(
      ventanaContiene(ventana, minutosLocales(madrugada('05:59'), ZONA)),
    ).toBe(true);
    expect(
      ventanaContiene(ventana, minutosLocales(madrugada('06:00'), ZONA)),
    ).toBe(false);
  });

  it('la madrugada del 22 NO pertenece a la mañana del 22 ni a la noche del 22', () => {
    const jueves = FechaCivil.desdeTexto('2026-10-22');
    const madrugada = minutosLocales(enBogota('03:00', '2026-10-22'), ZONA);

    expect(
      ventanaContiene(
        ventanaDeServicio(jueves, MANANA.horaInicio, MANANA.horas),
        madrugada,
      ),
    ).toBe(false);
    expect(
      ventanaContiene(
        ventanaDeServicio(jueves, NOCHE.horaInicio, NOCHE.horas),
        madrugada,
      ),
    ).toBe(false);
  });

  it('con margen, la ventana se adelanta (para marcar el inicio)', () => {
    const ventana = ventanaDeServicio(MIERCOLES, MANANA.horaInicio, MANANA.horas);
    const antes = minutosLocales(enBogota('05:35'), ZONA);
    const masAntes = minutosLocales(enBogota('05:29'), ZONA);

    expect(ventanaContiene(ventana, antes)).toBe(false);
    expect(ventanaContiene(ventana, antes, 30)).toBe(true);
    expect(ventanaContiene(ventana, masAntes, 30)).toBe(false);
  });

  it('usa la hora de la zona, no la de UTC', () => {
    // 01:00Z del 22 es la 20:00 del 21 en Bogotá: sigue siendo la noche del 21 (y no la del 22).
    const instante = minutosLocales(new Date('2026-10-22T01:00:00.000Z'), ZONA);

    expect(
      ventanaContiene(
        ventanaDeServicio(MIERCOLES, NOCHE.horaInicio, NOCHE.horas),
        instante,
      ),
    ).toBe(true);
    expect(
      ventanaContiene(
        ventanaDeServicio(
          FechaCivil.desdeTexto('2026-10-22'),
          NOCHE.horaInicio,
          NOCHE.horas,
        ),
        instante,
      ),
    ).toBe(false);
  });

  it('a las 8 p. m. de Colombia, la tarde de hoy ya terminó pero la noche no (H2)', () => {
    // 01:00Z del 22: en UTC ya es mañana, pero en Bogotá sigue siendo el 21.
    const momento = minutosLocales(new Date('2026-10-22T01:00:00.000Z'), ZONA);
    const yaTermino = (franja: typeof MANANA) =>
      momento >= ventanaDeServicio(MIERCOLES, franja.horaInicio, franja.horas).fin;

    expect(yaTermino(MANANA)).toBe(true);
    expect(yaTermino(TARDE)).toBe(true);
    expect(yaTermino(NOCHE)).toBe(false);
  });

  it('cuenta los minutos hasta el inicio, hacia adelante y hacia atrás', () => {
    const momento = minutosLocales(enBogota('10:00'), ZONA);

    expect(
      ventanaDeServicio(MIERCOLES, TARDE.horaInicio, TARDE.horas).inicio - momento,
    ).toBe(120);
    expect(
      ventanaDeServicio(MIERCOLES, MANANA.horaInicio, MANANA.horas).inicio - momento,
    ).toBe(-240);
  });

  it('para mañana temprano cuenta más de un día de minutos', () => {
    const jueves = FechaCivil.desdeTexto('2026-10-22');
    const momento = minutosLocales(enBogota('10:00'), ZONA);

    expect(
      ventanaDeServicio(jueves, MANANA.horaInicio, MANANA.horas).inicio - momento,
    ).toBe(20 * 60);
  });
});
