import type { ControlDelCuidador, ControlDeVerificacion, EstadoDeControl, MiPerfilDeCuidador, TipoDeDocumento } from "@/lib/types";

// Cómo se dice la postulación con palabras (F9). Sin `server-only`: lo usan las pantallas y las pruebas.

export const NOMBRE_DEL_CONTROL: Record<ControlDeVerificacion, string> = {
  antecedentes: "Antecedentes",
  titulos: "Títulos",
  psicotecnica: "Prueba psicotécnica",
};

export const NOMBRE_DEL_DOCUMENTO: Record<TipoDeDocumento, string> = {
  cedula: "Cédula",
  antecedentes: "Antecedentes",
  titulo: "Título",
  psicotecnica: "Psicotécnica",
  hoja_de_vida: "Hoja de vida",
};

export const DOCUMENTOS_OBLIGATORIOS: TipoDeDocumento[] = ["cedula", "antecedentes", "titulo", "psicotecnica"];

export const ESTADO_DEL_CONTROL: Record<EstadoDeControl, { texto: string; variante: "secondary" | "warning" | "success" | "destructive" }> = {
  sin_solicitar: { texto: "Sin enviar", variante: "secondary" },
  pendiente: { texto: "En revisión", variante: "warning" },
  aprobada: { texto: "Aprobado", variante: "success" },
  rechazada: { texto: "Rechazado", variante: "destructive" },
  vencida: { texto: "Vencido", variante: "destructive" },
};

// ¿Ya subió los cuatro documentos que pide la revisión?
export function tieneLosDocumentos(perfil: Pick<MiPerfilDeCuidador, "documentos">): boolean {
  return DOCUMENTOS_OBLIGATORIOS.every((tipo) => perfil.documentos.some((documento) => documento.tipo === tipo));
}

// Lo que se le dice al cuidador sobre dónde va.
export function resumenDeLaPostulacion(perfil: Pick<MiPerfilDeCuidador, "visible" | "controles">): { titulo: string; explicacion: string; tono: "exito" | "espera" | "atencion" } {
  const estados = perfil.controles.map((c: ControlDelCuidador) => c.estado);
  if (perfil.visible) return { titulo: "Ya apareces en la búsqueda", explicacion: "Las familias pueden verte y pedirte servicios.", tono: "exito" };
  if (estados.some((e) => e === "rechazada" || e === "vencida")) {
    return { titulo: "Hay algo por corregir", explicacion: "Un control fue rechazado o venció. Sube el documento nuevo y pide la revisión otra vez.", tono: "atencion" };
  }
  if (estados.some((e) => e === "pendiente")) {
    return { titulo: "Estamos revisando tus documentos", explicacion: "Un revisor mira cada control. Te avisaremos cuando haya respuesta.", tono: "espera" };
  }
  return { titulo: "Todavía no te mostramos a las familias", explicacion: "Sube tus documentos y envía tu perfil a revisión. Aparecerás cuando los tres controles estén aprobados.", tono: "espera" };
}
