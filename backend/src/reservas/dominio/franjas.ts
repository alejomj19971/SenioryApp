import type { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import {
  HORARIOS_DE_FRANJA,
  JORNADAS,
  type Jornada,
} from '../../compartido/dominio/jornada.js';
import type { RangoLibre } from '../../compartido/dominio/rango-libre.js';

export { HORARIOS_DE_FRANJA };

// Una prueba compara `HORARIOS_DE_FRANJA` (dominio compartido) con la tabla `reservas.franjas`. Hoy solo
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

export function inicioDelDia(fecha: FechaCivil): number {
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

// ¿El horario semanal del cuidador cubre POR COMPLETO la ventana de este servicio? Un servicio dura como
// máximo 8 horas y empieza como mucho a las 23:30, así que su ventana nunca se sale del día siguiente al de
// `fecha`: alcanza con mirar los rangos de esos dos días de la semana. Los rangos de cada día se convierten a
// minutos locales absolutos (el mismo espacio que ya usa `ventanaDeServicio`) y se fusionan los que queden
// contiguos o solapados: así un rango que termina a medianoche y el que sigue al otro día (o dos rangos del
// mismo día que se tocan, como mañana 06–12 y tarde 12–18) cuentan como uno solo, sin ninguna cuenta especial.
export function estaLibreEn(
  horariosLibres: readonly RangoLibre[],
  fecha: FechaCivil,
  horaInicio: number,
  horas: number,
): boolean {
  const ventana = ventanaDeServicio(fecha, horaInicio, horas);
  const manana = fecha.sumarDias(1);
  const ventanasLibres = horariosLibres
    .filter(
      (rango) =>
        rango.diaSemana === fecha.diaDeLaSemana() ||
        rango.diaSemana === manana.diaDeLaSemana(),
    )
    .map((rango) => {
      const base = inicioDelDia(
        rango.diaSemana === fecha.diaDeLaSemana() ? fecha : manana,
      );
      return { inicio: base + rango.horaInicio, fin: base + rango.horaFin };
    })
    .sort((a, b) => a.inicio - b.inicio);
  const fusionadas: HorarioDeFranja[] = [];
  for (const libre of ventanasLibres) {
    const anterior = fusionadas.at(-1);
    if (anterior !== undefined && libre.inicio <= anterior.fin) {
      anterior.fin = Math.max(anterior.fin, libre.fin);
    } else {
      fusionadas.push({ ...libre });
    }
  }
  return fusionadas.some(
    (libre) => libre.inicio <= ventana.inicio && ventana.fin <= libre.fin,
  );
}
