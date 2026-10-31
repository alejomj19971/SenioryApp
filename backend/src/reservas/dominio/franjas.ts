import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import type { Jornada } from '../../compartido/dominio/jornada.js';

// Los horarios de cada franja (decidido el 2026-10-26): mañana 06:00–12:00, tarde 12:00–18:00 y noche
// 18:00–06:00, que cruza la medianoche. Una prueba los compara con la tabla `reservas.franjas`.
//
// Los valores son minutos desde las 00:00 del día de la fecha del servicio; `fin` pasa de 1440 cuando la
// franja cruza la medianoche (la noche del lunes termina el martes a las 06:00).
export interface HorarioDeFranja {
  inicio: number;
  fin: number;
}

const MINUTOS_POR_DIA = 1_440;
const MS_POR_DIA = 86_400_000;

export const HORARIOS_DE_FRANJA: Readonly<Record<Jornada, HorarioDeFranja>> = {
  manana: { inicio: 6 * 60, fin: 12 * 60 },
  tarde: { inicio: 12 * 60, fin: 18 * 60 },
  noche: { inicio: 18 * 60, fin: MINUTOS_POR_DIA + 6 * 60 },
};

// Cuánto antes de empezar la franja el cuidador puede marcar que inició (llegó un poco antes).
export const MARGEN_PARA_INICIAR_MINUTOS = 30;

// Minutos transcurridos desde el 1 de enero de 1970, en la hora de pared de la zona. Comparar dos de estos
// valores es comparar dos momentos del calendario local, sin tropezar con la diferencia contra UTC.
function minutosLocales(ahora: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ahora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value);
  const dias =
    Date.UTC(valor('year'), valor('month') - 1, valor('day')) / MS_POR_DIA;
  return dias * MINUTOS_POR_DIA + valor('hour') * 60 + valor('minute');
}

function inicioDelDia(fecha: FechaCivil): number {
  return (
    (Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia) / MS_POR_DIA) *
    MINUTOS_POR_DIA
  );
}

// La franja de un servicio como un intervalo [inicio, fin) en minutos locales.
export function ventanaDeFranja(
  fecha: FechaCivil,
  jornada: Jornada,
): HorarioDeFranja {
  const base = inicioDelDia(fecha);
  const horario = HORARIOS_DE_FRANJA[jornada];
  return { inicio: base + horario.inicio, fin: base + horario.fin };
}

// ¿Ya pasó la franja? A las 8 p. m. de Colombia, la tarde de hoy ya terminó pero la noche no.
export function franjaYaTermino(
  fecha: FechaCivil,
  jornada: Jornada,
  ahora: Date,
  zona: string,
): boolean {
  return minutosLocales(ahora, zona) >= ventanaDeFranja(fecha, jornada).fin;
}

// ¿Estamos dentro de la franja? Con `margenInicioMinutos` se adelanta el comienzo (para marcar el inicio).
export function franjaContiene(
  fecha: FechaCivil,
  jornada: Jornada,
  ahora: Date,
  zona: string,
  margenInicioMinutos = 0,
): boolean {
  const { inicio, fin } = ventanaDeFranja(fecha, jornada);
  const momento = minutosLocales(ahora, zona);
  return momento >= inicio - margenInicioMinutos && momento < fin;
}

// Minutos que faltan para que empiece la franja (negativo si ya empezó). La política de reembolso (M7) mide
// con esto cuánta anticipación tuvo una cancelación.
export function minutosHastaElInicio(
  fecha: FechaCivil,
  jornada: Jornada,
  ahora: Date,
  zona: string,
): number {
  return ventanaDeFranja(fecha, jornada).inicio - minutosLocales(ahora, zona);
}
