import { horasPedibles, sumarDias, type AhoraEnColombia } from "@/lib/fecha-colombia";
import { etiquetaHoraInicio } from "@/lib/format";
import type { RangoLibre } from "@/lib/types";

// Cuándo puede atender un cuidador: lo primero que quiere saber una familia antes de elegir. Sale del horario semanal que el propio
// cuidador declara y de la hora actual en Colombia. Ojo: es una GUÍA, no una promesa. No descuenta los servicios que ya tiene
// reservados (el backend rechaza una solicitud que se cruce con uno), así que a veces una hora que aquí aparece libre ya está tomada.

// Hasta cuántos días adelante se busca. Pasado eso se dice que no hay horas por ahora.
export const DIAS_PARA_BUSCAR = 14;

export interface ProximaDisponibilidad {
  // «AAAA-MM-DD».
  fecha: string;
  // Minutos desde las 00:00: la primera hora de inicio que se puede pedir ese día.
  horaInicio: number;
}

// El primer día (desde `desde`, por omisión hoy) y la primera hora en que se le puede pedir un servicio de `horas` horas.
export function proximaDisponibilidad(
  horariosLibres: readonly RangoLibre[],
  ahora: AhoraEnColombia,
  horas = 1,
  desde: string = ahora.hoy,
): ProximaDisponibilidad | null {
  for (let dia = 0; dia < DIAS_PARA_BUSCAR; dia++) {
    const fecha = sumarDias(desde, dia);
    const primera = horasPedibles(fecha, horariosLibres, ahora, horas)[0];
    if (primera !== undefined) return { fecha, horaInicio: primera };
  }
  return null;
}

const formateadorDeDia = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

// «el lunes 30 de noviembre»: la fecha dicha con palabras (la coma que pone el formateador no se dice al hablar).
function diaConPalabras(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  return formateadorDeDia.format(new Date(Date.UTC(anio, mes - 1, dia))).replace(",", "");
}

// Lo que se le dice a la familia, en una línea. `hoy` es verdadero cuando puede atender hoy mismo (para resaltarlo).
export function describirProximaDisponibilidad(proxima: ProximaDisponibilidad | null, hoy: string): { texto: string; hoy: boolean } {
  if (proxima === null) return { texto: "Sin horas disponibles por ahora", hoy: false };
  const hora = etiquetaHoraInicio(proxima.horaInicio);
  if (proxima.fecha === hoy) return { texto: `Disponible hoy desde las ${hora}`, hoy: true };
  if (proxima.fecha === sumarDias(hoy, 1)) return { texto: `Disponible mañana desde las ${hora}`, hoy: false };
  return { texto: `Disponible el ${diaConPalabras(proxima.fecha)} desde las ${hora}`, hoy: false };
}
