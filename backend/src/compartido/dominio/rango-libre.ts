// Un bloque de tiempo libre de un cuidador, dentro de un mismo día de la semana, en minutos desde las 00:00
// (bloques de 30, el mismo paso que `reservas/dominio/franjas.ts`). Viven en el dominio compartido porque los
// usa Directorio (el horario semanal del cuidador) y Reservas (para comprobar si un horario cabe en él), y el
// dominio de un módulo no puede importar el de otro.
//
// Un turno que sigue después de la medianoche se declara como DOS rangos, uno por día (el de hoy hasta
// `horaFin = 1440`, el de mañana desde `horaInicio = 0`): así nunca hay que sumar días dentro de un rango.
export interface RangoLibre {
  // ISO: 1 = lunes … 7 = domingo.
  diaSemana: number;
  horaInicio: number;
  horaFin: number;
}

export const PASO_DE_MINUTOS_LIBRE = 30;
export const MINUTOS_POR_DIA = 1_440;

export function esRangoLibreValido(rango: RangoLibre): boolean {
  return (
    Number.isInteger(rango.diaSemana) &&
    rango.diaSemana >= 1 &&
    rango.diaSemana <= 7 &&
    Number.isInteger(rango.horaInicio) &&
    Number.isInteger(rango.horaFin) &&
    rango.horaInicio >= 0 &&
    rango.horaInicio % PASO_DE_MINUTOS_LIBRE === 0 &&
    rango.horaFin % PASO_DE_MINUTOS_LIBRE === 0 &&
    rango.horaFin <= MINUTOS_POR_DIA &&
    rango.horaInicio < rango.horaFin
  );
}
