import mensajesData from "@/data/mensajes.json";
import type { Mensaje } from "@/lib/types";

const conversaciones = mensajesData as Record<string, Mensaje[]>;

export async function listarMensajes(cuidadorId: string): Promise<Mensaje[]> {
  return conversaciones[cuidadorId] ?? [];
}
