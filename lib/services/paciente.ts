import familiaData from "@/data/familia.json";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import type { AdultoMayor, Cuidador, Familiar } from "@/lib/types";

const familia = familiaData as { familiar: Familiar; adultoMayor: AdultoMayor };

export async function obtenerFamiliar(): Promise<Familiar> {
  return familia.familiar;
}

export async function obtenerAdultoMayor(): Promise<AdultoMayor> {
  return familia.adultoMayor;
}

export async function obtenerCuidadorEnTurno(): Promise<Cuidador | null> {
  const { cuidadorAsignadoId } = familia.adultoMayor;
  if (!cuidadorAsignadoId) return null;
  return obtenerCuidador(cuidadorAsignadoId);
}
