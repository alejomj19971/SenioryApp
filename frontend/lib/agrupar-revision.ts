import type { Especialidad, HojaDeVidaPorRevisar, VerificacionParaRevisor } from "@/lib/types";

// La cola de revisión, agrupada por cuidador: antes se veía una tarjeta por cada control (hasta 3 por persona, más
// la hoja de vida aparte), así que revisar a alguien significaba buscarlo varias veces. Aquí una persona es una sola
// fila, y el orden sigue siendo por antigüedad: el cuidador con la solicitud más vieja (de cualquiera de sus
// controles o su hoja de vida) va primero.
export interface GrupoDeRevision {
  cuidadorId: string;
  nombre: string;
  zona: string | null;
  especialidad: Especialidad | null;
  masAntigua: string;
  controles: VerificacionParaRevisor[];
  hoja: HojaDeVidaPorRevisar | null;
}

export function agruparPorCuidador(cola: VerificacionParaRevisor[], hojas: HojaDeVidaPorRevisar[]): GrupoDeRevision[] {
  const grupos = new Map<string, GrupoDeRevision>();

  for (const verificacion of cola) {
    const existente = grupos.get(verificacion.cuidador.id);
    if (existente === undefined) {
      grupos.set(verificacion.cuidador.id, {
        cuidadorId: verificacion.cuidador.id,
        nombre: verificacion.cuidador.nombre,
        zona: verificacion.cuidador.zona,
        especialidad: verificacion.cuidador.especialidad,
        masAntigua: verificacion.solicitadaEn,
        controles: [verificacion],
        hoja: null,
      });
    } else {
      existente.controles.push(verificacion);
      if (verificacion.solicitadaEn < existente.masAntigua) existente.masAntigua = verificacion.solicitadaEn;
    }
  }

  for (const hoja of hojas) {
    const existente = grupos.get(hoja.cuidador.id);
    if (existente === undefined) {
      grupos.set(hoja.cuidador.id, {
        cuidadorId: hoja.cuidador.id,
        nombre: hoja.cuidador.nombre,
        zona: null,
        especialidad: null,
        masAntigua: hoja.documento.subidoEn,
        controles: [],
        hoja,
      });
    } else {
      existente.hoja = hoja;
      if (hoja.documento.subidoEn < existente.masAntigua) existente.masAntigua = hoja.documento.subidoEn;
    }
  }

  return [...grupos.values()].sort((a, b) => a.masAntigua.localeCompare(b.masAntigua));
}
