import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import { JORNADAS, type Jornada } from '../../compartido/dominio/jornada.js';

// Los horarios de cada franja (decidido el 2026-10-26): mañana 06:00–12:00, tarde 12:00–18:00 y noche
// 18:00–06:00, que cruza la medianoche. Una prueba los compara con la tabla `reservas.franjas`. Hoy solo
// clasifican la hora de inicio de un servicio (para la disponibilidad general del cuidador); el servicio en
// sí ya no está encerrado en una franja completa (ver `ventanaDeServicio`).
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

// Cuánto antes de empezar el servicio el cuidador puede marcar que inició (llegó un poco antes).
export const MARGEN_PARA_INICIAR_MINUTOS = 30;

// La familia elige la hora de inicio en bloques de 30 minutos: más fácil de tocar que un reloj libre, y evita
// horas como «3:07 p. m.». Mismo CHECK que `servicios_hora_inicio_valida`.
export const PASO_DE_MINUTOS = 30;
export const HORAS_INICIO_VALIDAS: readonly number[] = Array.from(
  { length: MINUTOS_POR_DIA / PASO_DE_MINUTOS },
  (_, i) => i * PASO_DE_MINUTOS,
);

export function esHoraInicioValida(minutos: number): boolean {
  return (
    Number.isInteger(minutos) &&
    minutos >= 0 &&
    minutos < MINUTOS_POR_DIA &&
    minutos % PASO_DE_MINUTOS === 0
  );
}

// A qué jornada corresponde una hora de inicio: solo para la disponibilidad general del cuidador («trabaja en
// las mañanas/tardes/noches»), no para acotar el servicio — un servicio puede cruzar de una franja a otra
// (p. ej. empezar 11:30 y terminar 13:30).
export function jornadaDe(horaInicio: number): Jornada {
  for (const jornada of JORNADAS) {
    const horario = HORARIOS_DE_FRANJA[jornada];
    if (horaInicio >= horario.inicio && horaInicio < Math.min(horario.fin, MINUTOS_POR_DIA)) {
      return jornada;
    }
  }
  // La cola de la noche que cruza medianoche (00:00–06:00).
  return 'noche';
}

// Minutos transcurridos desde el 1 de enero de 1970, en la hora de pared de la zona. Comparar dos de estos
// valores es comparar dos momentos del calendario local, sin tropezar con la diferencia contra UTC.
export function minutosLocales(ahora: Date, zona: string): number {
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

// La ventana real de UN servicio como un intervalo [inicio, fin) en minutos locales: su propia hora de
// inicio y las horas contratadas, sin importar los límites de la franja (puede cruzarlos, o cruzar
// medianoche).
export function ventanaDeServicio(
  fecha: FechaCivil,
  horaInicio: number,
  horas: number,
): HorarioDeFranja {
  const inicio = inicioDelDia(fecha) + horaInicio;
  return { inicio, fin: inicio + horas * 60 };
}

// ¿Contiene `ahora` esta ventana? Con `margenInicioMinutos` se adelanta el comienzo (para marcar el inicio).
export function ventanaContiene(
  ventana: HorarioDeFranja,
  momento: number,
  margenInicioMinutos = 0,
): boolean {
  return momento >= ventana.inicio - margenInicioMinutos && momento < ventana.fin;
}
