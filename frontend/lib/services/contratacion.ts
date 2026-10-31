import "server-only";
import { calcularServicio } from "@/lib/pricing";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import type { ContratacionConfirmada, DatosContratacion } from "@/lib/types";

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
