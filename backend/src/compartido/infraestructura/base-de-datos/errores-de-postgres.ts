// Reconoce las violaciones de restricciones de Postgres para que cada repositorio las traduzca a un
// error de dominio con sentido («ese correo ya está registrado») en vez de dejar pasar un error de
// base de datos.
//
// Drizzle envuelve el error original de `pg` en un DrizzleQueryError y lo deja en `cause`; dentro de
// una transacción puede haber más de una capa. Por eso se recorre la cadena de causas.

export type TipoDeViolacion = 'unica' | 'foranea' | 'check' | 'no_nula';

export interface ViolacionDeRestriccion {
  tipo: TipoDeViolacion;
  // Nombre de la restricción o del índice (por ejemplo, «usuarios_correo_unico»).
  restriccion: string | undefined;
}

// Códigos SQLSTATE de Postgres.
const TIPOS: Record<string, TipoDeViolacion> = {
  '23505': 'unica',
  '23503': 'foranea',
  '23514': 'check',
  '23502': 'no_nula',
};

const PROFUNDIDAD_MAXIMA = 5;

export function violacionDeRestriccion(
  error: unknown,
): ViolacionDeRestriccion | null {
  let actual: unknown = error;
  for (let i = 0; i < PROFUNDIDAD_MAXIMA && actual instanceof Error; i++) {
    const { code, constraint } = actual as {
      code?: unknown;
      constraint?: unknown;
    };
    if (typeof code === 'string' && code in TIPOS) {
      return {
        tipo: TIPOS[code] as TipoDeViolacion,
        restriccion: typeof constraint === 'string' ? constraint : undefined,
      };
    }
    actual = actual.cause;
  }
  return null;
}

// ¿Es una violación de unicidad de esta restricción o índice?
export function esViolacionDeUnicidad(
  error: unknown,
  restriccion: string,
): boolean {
  const violacion = violacionDeRestriccion(error);
  return violacion?.tipo === 'unica' && violacion.restriccion === restriccion;
}
