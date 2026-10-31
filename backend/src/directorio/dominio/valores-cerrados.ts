import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

// Valores con un conjunto cerrado de opciones. Son los mismos que los CHECK de la base de datos
// (docs/backend/BASE_DE_DATOS.md §3.3): agregar uno implica una migración nueva. Una prueba compara
// estas constantes con los CHECK.

export const ESPECIALIDADES = [
  'auxiliar',
  'enfermeria',
  'fisioterapia',
  'acompanamiento',
] as const;
export type Especialidad = (typeof ESPECIALIDADES)[number];

// Los tres controles que hacen visible a un cuidador (E7).
export const CONTROLES_DE_VERIFICACION = [
  'antecedentes',
  'titulos',
  'psicotecnica',
] as const;
export type ControlDeVerificacion = (typeof CONTROLES_DE_VERIFICACION)[number];

export const ESTADOS_DE_CUIDADOR = [
  'borrador',
  'en_revision',
  'activo',
  'suspendido',
] as const;
export type EstadoDeCuidador = (typeof ESTADOS_DE_CUIDADOR)[number];

export const ESTADOS_DE_VERIFICACION = [
  'pendiente',
  'aprobada',
  'rechazada',
  'vencida',
] as const;
export type EstadoDeVerificacion = (typeof ESTADOS_DE_VERIFICACION)[number];

export function especialidadDesdeTexto(texto: string): Especialidad {
  return exigir(
    ESPECIALIDADES,
    texto,
    'La especialidad no es válida',
    'especialidad.invalida',
  );
}

export function controlDesdeTexto(texto: string): ControlDeVerificacion {
  return exigir(
    CONTROLES_DE_VERIFICACION,
    texto,
    'El control de verificación no es válido',
    'verificacion.control_invalido',
  );
}

function exigir<T extends string>(
  opciones: readonly T[],
  texto: string,
  mensaje: string,
  codigo: string,
): T {
  const encontrada = opciones.find((opcion) => opcion === texto);
  if (encontrada === undefined) throw new ErrorDeValidacion(mensaje, codigo);
  return encontrada;
}
