import familiaData from "@/data/familia.json";
import type { AdultoMayor, Familiar } from "@/lib/types";

const familia = familiaData as { familiar: Familiar; adultoMayor: AdultoMayor };

export async function obtenerFamiliar(): Promise<Familiar> {
  return familia.familiar;
}

export async function obtenerAdultoMayor(): Promise<AdultoMayor> {
  return familia.adultoMayor;
}
