import type { Jornada, RangoLibre } from "@/lib/types";

// La fecha de un servicio es un DÍA CIVIL DE COLOMBIA, nunca un instante UTC (H2): a las 8 p. m. en Medellín ya es
// «mañana» en UTC, y el prototipo ofrecía «hoy» con la fecha equivocada. Sin `server-only`: lo usan la página (para
// decir qué es «hoy») y el formulario. El backend vuelve a validar todo.

export const ZONA_DEL_NEGOCIO = "America/Bogota";

// Las franjas (decididas el 2026-10-26): mañana 06–12, tarde 12–18 y noche 18–06 (cruza la medianoche). Hoy
// solo clasifican la hora de inicio (para la disponibilidad general del cuidador); el servicio en sí ya no
// está encerrado en una franja completa, puede cruzar de una a otra.
const MINUTOS_POR_DIA = 1_440;
const FRANJAS: Record<Jornada, { inicio: number; fin: number }> = {
  manana: { inicio: 6 * 60, fin: 12 * 60 },
  tarde: { inicio: 12 * 60, fin: 18 * 60 },
  noche: { inicio: 18 * 60, fin: MINUTOS_POR_DIA + 6 * 60 },
};

// La familia elige la hora de inicio en bloques de 30 minutos: más fácil de tocar que un reloj libre, y evita
// horas como «3:07 p. m.».
export const PASO_DE_MINUTOS = 30;
export const HORAS_INICIO_VALIDAS: readonly number[] = Array.from({ length: MINUTOS_POR_DIA / PASO_DE_MINUTOS }, (_, i) => i * PASO_DE_MINUTOS);

// A qué jornada corresponde una hora de inicio: solo para la disponibilidad general del cuidador.
export function jornadaDe(horaInicio: number): Jornada {
  for (const jornada of Object.keys(FRANJAS) as Jornada[]) {
    const horario = FRANJAS[jornada];
    if (horaInicio >= horario.inicio && horaInicio < Math.min(horario.fin, MINUTOS_POR_DIA)) return jornada;
  }
  return "noche";
}

export interface AhoraEnColombia {
  // «AAAA-MM-DD» de hoy en Colombia.
  hoy: string;
  // Minutos desde las 00:00 de hoy en Colombia.
  minutos: number;
}

export function ahoraEnColombia(ahora: Date = new Date()): AhoraEnColombia {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_DEL_NEGOCIO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(ahora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? "00";
  return {
    hoy: `${valor("year")}-${valor("month")}-${valor("day")}`,
    minutos: Number(valor("hour")) * 60 + Number(valor("minute")),
  };
}

// «AAAA-MM-DD» más (o menos) días, sin pasar por la zona horaria del equipo.
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

// ¿Ya pasó esa hora de inicio ese día? Para una fecha futura nunca; para una pasada, siempre.
export function horaYaPaso(fecha: string, horaInicio: number, ahora: AhoraEnColombia): boolean {
  if (fecha > ahora.hoy) return false;
  if (fecha < ahora.hoy) return true;
  return ahora.minutos >= horaInicio;
}

const MS_POR_DIA = 86_400_000;

function diasDesdeEpoca(fecha: string): number {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  return Date.UTC(anio, mes - 1, dia) / MS_POR_DIA;
}

// ISO: 1 = lunes … 7 = domingo. El 1 de enero de 1970 (día 0 desde la época) fue jueves (ISO 4).
function diaDeLaSemana(fecha: string): number {
  return (((diasDesdeEpoca(fecha) + 3) % 7) + 7) % 7 + 1;
}

// ¿El horario semanal del cuidador cubre POR COMPLETO la ventana [horaInicio, horaInicio + horas*60) de esa
// fecha? Mismo cálculo que el backend (`reservas/dominio/franjas.ts`, `estaLibreEn`): los rangos de hoy y de
// mañana se convierten a minutos absolutos y se fusionan los que queden contiguos o solapados, para que un
// rango que cruza la medianoche (o dos rangos del mismo día que se tocan, como mañana y tarde) cuenten como
// uno solo.
function estaLibreEn(horariosLibres: readonly RangoLibre[], fecha: string, horaInicio: number, horas: number): boolean {
  const inicioServicio = diasDesdeEpoca(fecha) * MINUTOS_POR_DIA + horaInicio;
  const finServicio = inicioServicio + horas * 60;
  const diaHoy = diaDeLaSemana(fecha);
  const diaManana = diaDeLaSemana(sumarDias(fecha, 1));
  const ventanas = horariosLibres
    .filter((r) => r.diaSemana === diaHoy || r.diaSemana === diaManana)
    .map((r) => {
      const base = (diasDesdeEpoca(fecha) + (r.diaSemana === diaHoy ? 0 : 1)) * MINUTOS_POR_DIA;
      return { inicio: base + r.horaInicio, fin: base + r.horaFin };
    })
    .sort((a, b) => a.inicio - b.inicio);
  const fusionadas: { inicio: number; fin: number }[] = [];
  for (const ventana of ventanas) {
    const anterior = fusionadas.at(-1);
    if (anterior !== undefined && ventana.inicio <= anterior.fin) anterior.fin = Math.max(anterior.fin, ventana.fin);
    else fusionadas.push({ ...ventana });
  }
  return fusionadas.some((libre) => libre.inicio <= inicioServicio && finServicio <= libre.fin);
}

// Las horas de inicio (cada 30 min) que todavía se pueden pedir ese día para esa duración, entre las que
// caben por completo en el horario semanal del cuidador y que no hayan pasado ya si la fecha es hoy.
export function horasPedibles(fecha: string, horariosLibres: readonly RangoLibre[], ahora: AhoraEnColombia, horas: number): number[] {
  return HORAS_INICIO_VALIDAS.filter((horaInicio) => estaLibreEn(horariosLibres, fecha, horaInicio, horas) && !horaYaPaso(fecha, horaInicio, ahora));
}

const ZONA_PARA_MOSTRAR = ZONA_DEL_NEGOCIO;
const formateadorDeHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA_PARA_MOSTRAR,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
// «HH:mm» de un instante, en hora de Colombia (determinista entre servidor y navegador).
export function horaEnColombia(iso: string): string {
  return formateadorDeHora.format(new Date(iso));
}
