import "server-only";
import { leerDelBackend } from "@/lib/api/cliente-servidor";
import type { CuidadorParaAdministradorDelBackend, RespuestaDeListadoParaAdministrador } from "@/lib/api/contratos/directorio";
import { ESTADOS_DE_CUIDADOR_EN_EL_PANEL, type EstadoDeCuidadorEnElPanel } from "@/lib/estados-de-cuidador";

// El listado de cuidadores del panel de los administradores: todos, de cualquier estado, sin teléfono ni documentos.

export interface CuidadorDelPanel {
  id: string;
  nombre: string;
  // La dirección de la foto en ESTE servidor ("" si no tiene): el navegador nunca ve la del backend.
  foto: string;
  especialidad: CuidadorParaAdministradorDelBackend["especialidad"];
  zona: string;
  estado: EstadoDeCuidadorEnElPanel;
  visible: boolean;
  calificacion: number | null;
  cantidadResenas: number;
  serviciosCompletados: number;
}

export interface ListadoDeCuidadoresDelPanel {
  cuidadores: CuidadorDelPanel[];
  hayMas: boolean;
}

// Un estado que no es de la lista (un enlace escrito a mano) se ignora: se muestra todo en vez de dar error.
export function estadoDelPanelDesdeTexto(texto: string | undefined): EstadoDeCuidadorEnElPanel | undefined {
  return ESTADOS_DE_CUIDADOR_EN_EL_PANEL.find((e) => e === texto);
}

export async function listarCuidadoresDelPanel(filtro: { busqueda?: string; estado?: EstadoDeCuidadorEnElPanel }): Promise<ListadoDeCuidadoresDelPanel> {
  const consulta: Record<string, string> = {};
  if (filtro.busqueda !== undefined && filtro.busqueda.trim() !== "") consulta.busqueda = filtro.busqueda.trim();
  if (filtro.estado !== undefined) consulta.estado = filtro.estado;
  const { cuidadores, hayMas } = await leerDelBackend<RespuestaDeListadoParaAdministrador>("/cuidadores/administracion", { consulta });
  return {
    hayMas,
    cuidadores: cuidadores.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      foto: c.fotoUrl !== null ? `/api/cuidadores/${c.id}/foto` : "",
      especialidad: c.especialidad,
      zona: c.zona,
      estado: c.estado,
      visible: c.visible,
      calificacion: c.calificacion,
      cantidadResenas: c.cantidadResenas,
      serviciosCompletados: c.serviciosCompletados,
    })),
  };
}
