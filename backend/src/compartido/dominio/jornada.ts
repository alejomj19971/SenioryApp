// Las tres franjas del día en que se presta un servicio. Las mismas que el CHECK de
// `reservas.servicios.jornada`. Viven en el dominio compartido porque las usan Directorio (para derivar en
// qué jornadas atiende un cuidador, a partir de su horario semanal) y Reservas (franja del servicio), y el
// dominio de un módulo no puede importar el de otro.
export const JORNADAS = ['manana', 'tarde', 'noche'] as const;

export type Jornada = (typeof JORNADAS)[number];

export function esJornada(texto: string): texto is Jornada {
  return (JORNADAS as readonly string[]).includes(texto);
}

export interface HorarioDeJornada {
  inicio: number;
  fin: number;
}

const MINUTOS_POR_DIA = 1_440;

// Los horarios de cada franja (decidido el 2026-10-26): mañana 06:00–12:00, tarde 12:00–18:00 y noche
// 18:00–06:00, que cruza la medianoche. Los valores son minutos desde las 00:00; `fin` pasa de 1440 cuando
// la franja cruza la medianoche (la noche del lunes termina el martes a las 06:00).
export const HORARIOS_DE_FRANJA: Readonly<Record<Jornada, HorarioDeJornada>> =
  {
    manana: { inicio: 6 * 60, fin: 12 * 60 },
    tarde: { inicio: 12 * 60, fin: 18 * 60 },
    noche: { inicio: 18 * 60, fin: MINUTOS_POR_DIA + 6 * 60 },
  };
