import { v5 as uuidv5 } from 'uuid';
import type { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Jornada } from '../../../../compartido/dominio/jornada.js';
import type { EntradaDeCuidadorImportado } from '../../../aplicacion/casos-de-uso/importar-cuidador.js';
import type { Especialidad } from '../../../dominio/valores-cerrados.js';
import {
  ErrorDeArchivo,
  importarEntradas,
  type CasoImportarCuidador,
} from './comando-importar-cuidadores.js';

// Cuidadores de DESARROLLO: para trabajar en local, en las pruebas y en staging. Nunca llegan a producción:
// el comando se niega a correr allí. Los correos usan el dominio reservado `.invalid` (no recibe correo) y los
// teléfonos son números inventados que no existen. Los cuidadores reales entran por
// `npm run cuidadores:importar`, con sus controles revisados por el equipo.
//
// El comando se puede repetir: un correo que ya tiene cuenta se informa como «ya existía».

const ESPACIO_DE_LAS_SEMILLAS = '3f0a4c1e-8d52-4e0b-9b7a-6c2f1d9e4a10';
// Quien figura como revisor de los controles de estos datos de prueba.
export const REVISOR_DE_LAS_SEMILLAS = uuidv5(
  'revisor-de-semillas',
  ESPACIO_DE_LAS_SEMILLAS,
);

interface Muestra {
  nombre: string;
  correo: string;
  especialidad: Especialidad;
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: number;
  zona: string;
  disponibilidad: Jornada[];
  bio: string;
}

const MUESTRAS: Muestra[] = [
  {
    nombre: 'Marta Lucía Ramírez',
    correo: 'marta@prueba.seniory.invalid',
    especialidad: 'enfermeria',
    titulo: 'Enfermera profesional',
    aniosExperiencia: 12,
    tarifaHora: 32000,
    zona: 'Laureles',
    disponibilidad: ['manana', 'tarde'],
    bio: 'Enfermera con experiencia en cuidado de personas con movilidad reducida y manejo de medicación.',
  },
  {
    nombre: 'José Hernán Cárdenas',
    correo: 'jose@prueba.seniory.invalid',
    especialidad: 'auxiliar',
    titulo: 'Auxiliar de enfermería',
    aniosExperiencia: 8,
    tarifaHora: 22000,
    zona: 'El Poblado',
    disponibilidad: ['manana', 'tarde', 'noche'],
    bio: 'Acompañamiento en la rutina diaria: aseo, alimentación y movilización segura.',
  },
  {
    nombre: 'Luz Marina Ospina',
    correo: 'luz@prueba.seniory.invalid',
    especialidad: 'acompanamiento',
    titulo: 'Técnica en atención al adulto mayor',
    aniosExperiencia: 5,
    tarifaHora: 18000,
    zona: 'Envigado',
    disponibilidad: ['tarde'],
    bio: 'Compañía, conversación y paseos cortos; apoyo en las actividades del día.',
  },
  {
    nombre: 'Carlos Andrés Gómez',
    correo: 'carlos@prueba.seniory.invalid',
    especialidad: 'fisioterapia',
    titulo: 'Fisioterapeuta',
    aniosExperiencia: 10,
    tarifaHora: 38000,
    zona: 'Laureles',
    disponibilidad: ['manana'],
    bio: 'Ejercicios de movilidad y prevención de caídas en casa, según indicación del médico tratante.',
  },
  {
    nombre: 'Diana Patricia Vélez',
    correo: 'diana@prueba.seniory.invalid',
    especialidad: 'enfermeria',
    titulo: 'Enfermera profesional',
    aniosExperiencia: 15,
    tarifaHora: 35000,
    zona: 'Sabaneta',
    disponibilidad: ['noche'],
    bio: 'Cuidado nocturno de personas que requieren vigilancia y administración de medicamentos.',
  },
  {
    nombre: 'Gloria Inés Mejía',
    correo: 'gloria@prueba.seniory.invalid',
    especialidad: 'auxiliar',
    titulo: 'Auxiliar de enfermería',
    aniosExperiencia: 3,
    tarifaHora: 20000,
    zona: 'Belén',
    disponibilidad: ['manana', 'tarde'],
    bio: 'Apoyo en el cuidado personal y en el seguimiento de la alimentación.',
  },
  {
    nombre: 'Andrés Felipe Zapata',
    correo: 'andres@prueba.seniory.invalid',
    especialidad: 'acompanamiento',
    titulo: 'Cuidador con curso de primeros auxilios',
    aniosExperiencia: 4,
    tarifaHora: 16000,
    zona: 'El Poblado',
    disponibilidad: ['tarde', 'noche'],
    bio: 'Acompañamiento en casa y en citas médicas, con trato paciente y puntual.',
  },
  {
    nombre: 'Beatriz Elena Londoño',
    correo: 'beatriz@prueba.seniory.invalid',
    especialidad: 'fisioterapia',
    titulo: 'Fisioterapeuta',
    aniosExperiencia: 7,
    tarifaHora: 36000,
    zona: 'Envigado',
    disponibilidad: ['manana', 'tarde'],
    bio: 'Rehabilitación después de cirugías y acompañamiento en la recuperación de la marcha.',
  },
  {
    nombre: 'Jhon Fredy Pérez',
    correo: 'jhon@prueba.seniory.invalid',
    especialidad: 'auxiliar',
    titulo: 'Auxiliar de enfermería',
    aniosExperiencia: 6,
    tarifaHora: 21000,
    zona: 'Belén',
    disponibilidad: ['noche'],
    bio: 'Turnos nocturnos: vigilancia, cambios de posición y apoyo al descanso.',
  },
];

// Teléfonos inventados, de la forma +57300000000N: reconocibles como falsos.
function telefonoDe(indice: number): string {
  return `+5730000000${String(indice + 1).padStart(2, '0')}`;
}

export function muestrasDeCuidadores(
  hoy: FechaCivil,
): EntradaDeCuidadorImportado[] {
  // Los controles valen dos años desde hoy: las semillas nunca nacen con un control a punto de vencer.
  const vence = hoy.sumarDias(730).aTexto();
  return MUESTRAS.map((muestra, indice) => ({
    ...muestra,
    telefono: telefonoDe(indice),
    controles: [
      { control: 'antecedentes', vigenteHasta: vence },
      { control: 'titulos', vigenteHasta: null },
      { control: 'psicotecnica', vigenteHasta: vence },
    ],
  }));
}

export async function sembrarDirectorio(
  entorno: Record<string, string | undefined>,
  caso: CasoImportarCuidador,
  hoy: FechaCivil,
): Promise<string[]> {
  if (entorno.NODE_ENV === 'production') {
    throw new ErrorDeArchivo(
      'Las semillas son datos de ejemplo y no se pueden correr en producción.',
    );
  }
  const { mensajes, fallaron } = await importarEntradas(
    {
      revisadoPor: REVISOR_DE_LAS_SEMILLAS,
      cuidadores: muestrasDeCuidadores(hoy),
    },
    caso,
  );
  if (fallaron > 0) {
    throw new ErrorDeArchivo(
      `No se pudieron sembrar ${fallaron} cuidador(es):\n${mensajes.join('\n')}`,
    );
  }
  return mensajes;
}
