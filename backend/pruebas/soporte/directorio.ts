import { FechaCivil } from '../../src/compartido/dominio/fecha-civil.js';
import { Cuidador } from '../../src/directorio/dominio/cuidador.js';
import type { CuidadorId } from '../../src/directorio/dominio/ids.js';
import {
  CONTROLES_DE_VERIFICACION,
  type ControlDeVerificacion,
} from '../../src/directorio/dominio/valores-cerrados.js';
import { Verificacion } from '../../src/directorio/dominio/verificacion.js';
import { AHORA, idDePrueba } from './identidad.js';

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
  disponibilidad?: ('manana' | 'tarde' | 'noche')[];
  usuarioId?: string | null;
  telefono?: string;
  // Los controles que tiene aprobados (por defecto, los tres).
  controles?: readonly ControlDeVerificacion[];
  activo?: boolean;
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
    disponibilidad: opciones.disponibilidad ?? ['manana', 'tarde'],
    bio: 'Cuido con paciencia y cariño.',
    ahora: AHORA,
  });
  for (const control of opciones.controles ?? CONTROLES_DE_VERIFICACION) {
    cuidador.conVerificacion(verificacionDePrueba(id, control));
  }
  if (opciones.activo ?? true) {
    cuidador.activar(AHORA);
    cuidador.recalcularVisibilidad(HOY_DE_PRUEBA, AHORA);
  }
  return cuidador;
}
