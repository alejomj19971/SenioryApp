import { horaEnColombia } from "@/lib/fecha-colombia";

const formateadorCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatearCOP(valor: number): string {
  return formateadorCOP.format(valor);
}

// Todas las fechas y horas se muestran en hora de Colombia, sin importar dónde corra el código (el servidor del hosting
// suele estar en UTC): así la persona ve la misma hora en el servidor y en el navegador.
const formateadorFecha = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

const formateadorFechaHora = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Bogota",
});

// Un día civil «AAAA-MM-DD» (la fecha de un servicio) como «domingo, 1 de noviembre». Se formatea en UTC a propósito:
// el día ya es el de Colombia, y pasarlo por la zona horaria del equipo lo correría un día.
const formateadorDeDiaCivil = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export function formatearDiaCivil(fecha: string): string {
  return formateadorDeDiaCivil.format(new Date(`${fecha}T00:00:00Z`));
}

// Un día civil con su año, «10 de mayo de 2027»: para fechas lejanas, como la vigencia de un documento.
const formateadorDeDiaCivilConAnio = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export function formatearDiaCivilConAnio(fecha: string): string {
  return formateadorDeDiaCivilConAnio.format(new Date(`${fecha}T00:00:00Z`));
}

export function formatearFecha(fechaISO: string): string {
  return formateadorFecha.format(new Date(fechaISO));
}

export function formatearFechaHora(fechaISO: string): string {
  return formateadorFechaHora.format(new Date(fechaISO));
}

// HH:mm en hora de Colombia (determinista entre el servidor y el navegador: no depende de la zona del equipo).
export function formatearHora(fechaISO: string): string {
  return horaEnColombia(fechaISO);
}

import type { Especialidad, Jornada } from "@/lib/types";

const etiquetasEspecialidad: Record<Especialidad, string> = {
  auxiliar: "Auxiliar de enfermería",
  enfermeria: "Enfermería",
  fisioterapia: "Fisioterapia",
  acompanamiento: "Acompañamiento",
};

const etiquetasJornada: Record<Jornada, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
};

export function etiquetaEspecialidad(especialidad: Especialidad): string {
  return etiquetasEspecialidad[especialidad];
}

export function etiquetaJornada(jornada: Jornada): string {
  return etiquetasJornada[jornada];
}

// Minutos desde las 00:00 (lo que manda el backend como `horaInicio`) como «6:00 a. m.»: sin zona horaria de
// por medio, es la misma hora sin importar dónde corra el código.
export function etiquetaHoraInicio(minutos: number): string {
  const horas24 = Math.floor(minutos / 60) % 24;
  const resto = minutos % 60;
  const horas12 = horas24 % 12 === 0 ? 12 : horas24 % 12;
  const sufijo = horas24 < 12 ? "a. m." : "p. m.";
  return `${horas12}:${String(resto).padStart(2, "0")} ${sufijo}`;
}

// «6:00 a. m. – 8:00 a. m.»: la ventana real de un servicio, cruce de medianoche incluido (el «fin» se
// calcula módulo 24 h, sin decir de qué día es — para eso ya está la fecha del servicio).
export function etiquetaRangoDeHoras(horaInicio: number, horas: number): string {
  const fin = (horaInicio + horas * 60) % 1_440;
  return `${etiquetaHoraInicio(horaInicio)} – ${etiquetaHoraInicio(fin)}`;
}

// La distancia que manda el backend cuando la familia buscó por cercanía. Bajo el kilómetro se ve en metros,
// redondeados a la decena (no tiene sentido fingir precisión de metro a metro con GPS de celular).
export function formatearDistanciaKm(km: number): string {
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function obtenerIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const iniciales = [partes[0], partes[partes.length - 1]]
    .filter(Boolean)
    .map((parte) => parte[0]?.toUpperCase() ?? "");
  return iniciales.join("");
}

export function formatearMinutosDesde(fechaISO: string): string {
  const minutos = Math.max(
    0,
    Math.round((Date.now() - new Date(fechaISO).getTime()) / 60000),
  );
  if (minutos < 1) return "hace un momento";
  if (minutos === 1) return "hace 1 minuto";
  return `hace ${minutos} min`;
}
