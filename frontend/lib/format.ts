const formateadorCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatearCOP(valor: number): string {
  return formateadorCOP.format(valor);
}

const formateadorFecha = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
});

const formateadorFechaHora = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatearFecha(fechaISO: string): string {
  return formateadorFecha.format(new Date(fechaISO));
}

export function formatearFechaHora(fechaISO: string): string {
  return formateadorFechaHora.format(new Date(fechaISO));
}

// Formato manual (no Intl): el espacio antes de "a. m."/"p. m." que genera
// Intl.DateTimeFormat difiere entre el ICU de Node y el del navegador, lo
// que rompe la hidratación en componentes cliente. HH:mm es determinista.
export function formatearHora(fechaISO: string): string {
  const fecha = new Date(fechaISO);
  const horas = fecha.getHours().toString().padStart(2, "0");
  const minutos = fecha.getMinutes().toString().padStart(2, "0");
  return `${horas}:${minutos}`;
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
