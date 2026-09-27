import medicamentosData from "@/data/medicamentos.json";
import signosVitalesData from "@/data/signos-vitales.json";
import type { LecturaSignos, Medicamento } from "@/lib/types";

const medicamentos = medicamentosData as Medicamento[];
const signosVitales = signosVitalesData as LecturaSignos[];

export async function listarMedicamentos(): Promise<Medicamento[]> {
  return medicamentos;
}

export async function listarSignosVitales(): Promise<LecturaSignos[]> {
  return signosVitales;
}

export async function obtenerUltimaLecturaSignos(): Promise<LecturaSignos | null> {
  if (signosVitales.length === 0) return null;
  return signosVitales[signosVitales.length - 1];
}

export async function obtenerProximoMedicamento(): Promise<Medicamento | null> {
  const pendiente = medicamentos.find((medicamento) => !medicamento.tomado);
  return pendiente ?? null;
}
