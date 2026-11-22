import {
  HORARIOS_DE_FRANJA,
  JORNADAS,
  type Jornada,
} from '../../compartido/dominio/jornada.js';
import type { RangoLibre } from '../../compartido/dominio/rango-libre.js';

const MINUTOS_POR_DIA = 1_440;

function seSolapan(
  a: { inicio: number; fin: number },
  b: { inicio: number; fin: number },
): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

// ¿Este rango (de un día cualquiera) cae, aunque sea en parte, dentro de esta jornada? La noche cruza la
// medianoche (18:00–06:00 del día siguiente): se compara también contra la cola 00:00–06:00.
function rangoEnJornada(rango: RangoLibre, jornada: Jornada): boolean {
  const horario = HORARIOS_DE_FRANJA[jornada];
  const ventana = { inicio: rango.horaInicio, fin: rango.horaFin };
  if (seSolapan(ventana, { inicio: horario.inicio, fin: Math.min(horario.fin, MINUTOS_POR_DIA) })) {
    return true;
  }
  return (
    horario.fin > MINUTOS_POR_DIA &&
    seSolapan(ventana, { inicio: 0, fin: horario.fin - MINUTOS_POR_DIA })
  );
}

// En qué jornadas atiende el cuidador «alguna vez» (en cualquier día de la semana), para mostrarlo en su
// perfil público y para el filtro de búsqueda por jornada: una vista coarse derivada de su horario semanal
// real, que no distingue día ni hora exacta.
export function jornadasDeHorario(
  horariosLibres: readonly RangoLibre[],
): Jornada[] {
  return JORNADAS.filter((jornada) =>
    horariosLibres.some((rango) => rangoEnJornada(rango, jornada)),
  );
}
