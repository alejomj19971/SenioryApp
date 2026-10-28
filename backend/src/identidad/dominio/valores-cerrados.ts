import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';

// Valores con un conjunto cerrado de opciones. Son los mismos que los CHECK de la base de datos
// (docs/backend/BASE_DE_DATOS.md §3.2): agregar uno implica una migración nueva.

export const PARENTESCOS = [
  'hijo_hija',
  'nieto_nieta',
  'conyuge',
  'hermano_hermana',
  'otro',
] as const;
export type Parentesco = (typeof PARENTESCOS)[number];

export const FINALIDADES_DE_CONSENTIMIENTO = ['datos_de_salud'] as const;
export type FinalidadDeConsentimiento =
  (typeof FINALIDADES_DE_CONSENTIMIENTO)[number];

export const CALIDADES_DE_CONSENTIMIENTO = [
  'titular',
  'representante',
] as const;
export type CalidadDeConsentimiento =
  (typeof CALIDADES_DE_CONSENTIMIENTO)[number];

export function parentescoDesdeTexto(texto: string): Parentesco {
  return exigir(
    PARENTESCOS,
    texto,
    'El parentesco no es válido',
    'parentesco.invalido',
  );
}

export function finalidadDesdeTexto(texto: string): FinalidadDeConsentimiento {
  return exigir(
    FINALIDADES_DE_CONSENTIMIENTO,
    texto,
    'La finalidad del consentimiento no es válida',
    'consentimiento.finalidad_invalida',
  );
}

export function calidadDesdeTexto(texto: string): CalidadDeConsentimiento {
  return exigir(
    CALIDADES_DE_CONSENTIMIENTO,
    texto,
    'La calidad con la que se consiente no es válida',
    'consentimiento.calidad_invalida',
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
