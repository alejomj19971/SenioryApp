import { calcularServicio, type ResumenServicio } from "@/lib/pricing";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import type { Jornada } from "@/lib/types";

export interface DatosContratacion {
  cuidadorId: string;
  fecha: string; // ISO
  jornada: Jornada;
  horas: number;
}

export interface ContratacionConfirmada {
  id: string;
  cuidadorNombre: string;
  fecha: string;
  jornada: Jornada;
  horas: number;
  resumen: ResumenServicio;
}

export async function confirmarContratacion(
  datos: DatosContratacion,
): Promise<ContratacionConfirmada> {
  const cuidador = await obtenerCuidador(datos.cuidadorId);
  if (!cuidador) {
    throw new Error(`Cuidador no encontrado: ${datos.cuidadorId}`);
  }
  const resumen = calcularServicio(cuidador.tarifaHora, datos.horas);
  return {
    id: `sim-${Date.now()}`,
    cuidadorNombre: cuidador.nombre,
    fecha: datos.fecha,
    jornada: datos.jornada,
    horas: datos.horas,
    resumen,
  };
}
