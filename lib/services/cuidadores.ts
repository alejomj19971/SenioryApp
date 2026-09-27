import cuidadoresData from "@/data/cuidadores.json";
import type { Cuidador, FiltrosCuidador } from "@/lib/types";

const cuidadores = cuidadoresData as Cuidador[];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export async function listarCuidadores(
  filtros?: FiltrosCuidador,
): Promise<Cuidador[]> {
  if (!filtros) return cuidadores;

  return cuidadores.filter((cuidador) => {
    if (filtros.busqueda) {
      const termino = normalizar(filtros.busqueda);
      const coincide =
        normalizar(cuidador.nombre).includes(termino) ||
        normalizar(cuidador.especialidad).includes(termino);
      if (!coincide) return false;
    }
    if (filtros.especialidad && cuidador.especialidad !== filtros.especialidad) {
      return false;
    }
    if (
      filtros.zona &&
      !normalizar(cuidador.zona).includes(normalizar(filtros.zona))
    ) {
      return false;
    }
    if (
      filtros.jornada &&
      !cuidador.disponibilidad.includes(filtros.jornada)
    ) {
      return false;
    }
    if (
      filtros.tarifaMaxima !== undefined &&
      cuidador.tarifaHora > filtros.tarifaMaxima
    ) {
      return false;
    }
    return true;
  });
}

export async function obtenerCuidador(id: string): Promise<Cuidador | null> {
  return cuidadores.find((cuidador) => cuidador.id === id) ?? null;
}
