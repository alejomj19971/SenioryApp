import type { Jornada } from "@/lib/types";

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

// Las horas de inicio (cada 30 min) que todavía se pueden pedir ese día, entre las que atiende el cuidador
// (por su jornada general) y que no hayan pasado ya si la fecha es hoy.
export function horasPedibles(fecha: string, disponibilidad: readonly Jornada[], ahora: AhoraEnColombia): number[] {
  return HORAS_INICIO_VALIDAS.filter((horaInicio) => disponibilidad.includes(jornadaDe(horaInicio)) && !horaYaPaso(fecha, horaInicio, ahora));
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
