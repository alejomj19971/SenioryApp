"use server";

import { ErrorDeApi } from "@/lib/api/error-de-api";
import { sanearFiltros } from "@/lib/filtros-de-cuidadores";
import { listarCuidadores, type PaginaDeCuidadores } from "@/lib/services/cuidadores";

export type ResultadoDeMasCuidadores =
  | { ok: true; pagina: PaginaDeCuidadores }
  | { ok: false; mensaje: string };

const LARGO_MAXIMO_DEL_CURSOR = 500;

// «Ver más»: la página siguiente de la misma búsqueda. Es un endpoint público de Next: el cursor y los filtros
// se tratan como entrada de cualquiera (el backend los valida de nuevo y un cursor ajeno da 400).
export async function cargarMasCuidadores(filtros: unknown, cursor: unknown): Promise<ResultadoDeMasCuidadores> {
  if (typeof cursor !== "string" || cursor === "" || cursor.length > LARGO_MAXIMO_DEL_CURSOR) {
    return { ok: false, mensaje: "No pudimos cargar más cuidadores. Vuelve a buscar." };
  }
  try {
    return { ok: true, pagina: await listarCuidadores(sanearFiltros(filtros), cursor) };
  } catch (error) {
    if (error instanceof ErrorDeApi) {
      return { ok: false, mensaje: error.estado === 400 ? "No pudimos cargar más cuidadores. Vuelve a buscar." : error.message };
    }
    throw error;
  }
}
