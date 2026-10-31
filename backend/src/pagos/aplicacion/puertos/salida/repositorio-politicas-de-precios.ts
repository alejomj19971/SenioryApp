import type { PoliticaDePrecios } from '../../../dominio/politica-de-precios.js';

export interface RepositorioPoliticasDePrecios {
  // La política que rige en `ahora`: la de vigencia más reciente que ya comenzó. Null si no hay ninguna.
  obtenerVigente(ahora: Date): Promise<PoliticaDePrecios | null>;

  // Una versión concreta (para liquidar un servicio con las comisiones con las que se cotizó).
  buscarPorVersion(version: number): Promise<PoliticaDePrecios | null>;
}

export const REPOSITORIO_POLITICAS_DE_PRECIOS = Symbol(
  'RepositorioPoliticasDePrecios',
);
