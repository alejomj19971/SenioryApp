import { FechaCivil } from '../../src/compartido/dominio/fecha-civil.js';
import {
  HORARIOS_DE_FRANJA,
  type Jornada,
} from '../../src/compartido/dominio/jornada.js';
import type { RangoLibre } from '../../src/compartido/dominio/rango-libre.js';
import { Cuidador } from '../../src/directorio/dominio/cuidador.js';
import type { CuidadorId } from '../../src/directorio/dominio/ids.js';
import {
  CONTROLES_DE_VERIFICACION,
  type ControlDeVerificacion,
} from '../../src/directorio/dominio/valores-cerrados.js';
import { Verificacion } from '../../src/directorio/dominio/verificacion.js';
import { AHORA, idDePrueba } from './identidad.js';

// Expande unas jornadas a un horario que se repite los 7 días de la semana (conveniencia para pruebas que
// antes solo les importaba la jornada, no el día). La noche cruza la medianoche: queda partida en dos rangos.
export function horarioDeJornadas(...jornadas: Jornada[]): RangoLibre[] {
  const rangos: RangoLibre[] = [];
  for (let dia = 1; dia <= 7; dia++) {
    for (const jornada of jornadas) {
      const horario = HORARIOS_DE_FRANJA[jornada];
      if (horario.fin > 1_440) {
        rangos.push({ diaSemana: dia, horaInicio: horario.inicio, horaFin: 1_440 });
        rangos.push({
          diaSemana: dia === 7 ? 1 : dia + 1,
          horaInicio: 0,
          horaFin: horario.fin - 1_440,
        });
      } else {
        rangos.push({ diaSemana: dia, horaInicio: horario.inicio, horaFin: horario.fin });
      }
    }
  }
  return rangos;
}

// Todos los días, abierto las 24 horas: el valor por defecto de las pruebas que no les importa la
// disponibilidad (para que no se rechace por accidente un horario que la prueba no está probando).
const TODO_EL_DIA_TODOS_LOS_DIAS: RangoLibre[] = Array.from(
  { length: 7 },
  (_, i) => ({ diaSemana: i + 1, horaInicio: 0, horaFin: 1_440 }),
);

// Datos de prueba de Directorio: sin base de datos ni red.

export const HOY_DE_PRUEBA = FechaCivil.desdeTexto('2026-10-21');
export const REVISOR_DE_PRUEBA = '0198aaaa-0000-7000-8000-000000000001';

export function verificacionDePrueba(
  cuidadorId: CuidadorId,
  control: ControlDeVerificacion,
  opciones: { vigenteHasta?: FechaCivil | null } = {},
): Verificacion {
  return Verificacion.aprobadaFueraDeLinea({
    id: idDePrueba<'Verificacion'>(),
    cuidadorId,
    control,
    revisadoPor: REVISOR_DE_PRUEBA,
    ahora: AHORA,
    vigenteHasta:
      opciones.vigenteHasta === undefined
        ? HOY_DE_PRUEBA.sumarDias(365)
        : opciones.vigenteHasta,
  });
}

export interface OpcionesDeCuidadorDePrueba {
  id?: CuidadorId;
  nombre?: string;
  especialidad?: 'auxiliar' | 'enfermeria' | 'fisioterapia' | 'acompanamiento';
  tarifaHora?: number;
  zona?: string;
  // Conveniencia: expande a un horario que se repite los 7 días. `horariosLibres` manda si se da.
  jornadas?: Jornada[];
  horariosLibres?: RangoLibre[];
  usuarioId?: string | null;
  telefono?: string;
  // Los controles que tiene aprobados (por defecto, los tres).
  controles?: readonly ControlDeVerificacion[];
  activo?: boolean;
  ubicacion?: { latitud: number; longitud: number };
}

// Un cuidador con sus controles aprobados y, por defecto, activo y visible.
export function cuidadorDePrueba(
  opciones: OpcionesDeCuidadorDePrueba = {},
): Cuidador {
  const id = opciones.id ?? idDePrueba<'Cuidador'>();
  const cuidador = Cuidador.registrar({
    id,
    usuarioId: opciones.usuarioId ?? null,
    nombre: opciones.nombre ?? 'Marta Elena Restrepo',
    especialidad: opciones.especialidad ?? 'enfermeria',
    titulo: 'Técnica en Enfermería — SENA',
    aniosExperiencia: 7,
    tarifaHora: opciones.tarifaHora ?? 20_000,
    telefono: opciones.telefono ?? '+573168393514',
    zona: opciones.zona ?? 'Laureles, Medellín',
    horariosLibres:
      opciones.horariosLibres ??
      (opciones.jornadas !== undefined
        ? horarioDeJornadas(...opciones.jornadas)
        : TODO_EL_DIA_TODOS_LOS_DIAS),
    bio: 'Cuido con paciencia y cariño.',
    ahora: AHORA,
  });
  if (opciones.ubicacion !== undefined) {
    cuidador.actualizarPerfil(
      {
        latitud: opciones.ubicacion.latitud,
        longitud: opciones.ubicacion.longitud,
      },
      AHORA,
    );
  }
  for (const control of opciones.controles ?? CONTROLES_DE_VERIFICACION) {
    cuidador.conVerificacion(verificacionDePrueba(id, control));
  }
  if (opciones.activo ?? true) {
    cuidador.activar(AHORA);
    cuidador.recalcularVisibilidad(HOY_DE_PRUEBA, AHORA);
  }
  return cuidador;
}
