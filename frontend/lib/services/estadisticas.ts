import "server-only";
import { leerDelBackend } from "@/lib/api/cliente-servidor";
import type { RespuestaDeEstadisticasDeCuidadores } from "@/lib/api/contratos/directorio";
import type { RespuestaDeEstadisticasDeServicios } from "@/lib/api/contratos/reservas";

// El resumen del panel de los administradores: solo conteos, ningún dato de ninguna persona.
export type EstadisticasDeServicios = RespuestaDeEstadisticasDeServicios["estadisticas"];
export type EstadisticasDeCuidadores = RespuestaDeEstadisticasDeCuidadores["estadisticas"];

export async function obtenerEstadisticasDeServicios(): Promise<EstadisticasDeServicios> {
  return (await leerDelBackend<RespuestaDeEstadisticasDeServicios>("/servicios/estadisticas")).estadisticas;
}

export async function obtenerEstadisticasDeCuidadores(): Promise<EstadisticasDeCuidadores> {
  return (await leerDelBackend<RespuestaDeEstadisticasDeCuidadores>("/cuidadores/estadisticas")).estadisticas;
}
