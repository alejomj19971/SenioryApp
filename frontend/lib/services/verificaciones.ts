import "server-only";
import { escribirEnBackend, leerDelBackend, type ResultadoDeEscritura } from "@/lib/api/cliente-servidor";
import type { RespuestaDeCola, RespuestaDeDecision, RespuestaDeDocumento, RespuestaDeExpediente, RespuestaDeHojasPendientes } from "@/lib/api/contratos/verificacion";
import { aDocumento } from "@/lib/services/postulacion";
import { descargarArchivoDelBackend, type ResultadoDeArchivo } from "@/lib/services/archivos";
import { notFound } from "next/navigation";
import type { ControlDeVerificacion, DocumentoSubido, EstadoDeControl, HojaDeVidaPorRevisar, VerificacionParaRevisor } from "@/lib/types";

// El panel de los revisores (M9), solo administradores: la cola de verificaciones, los documentos privados y la hoja de
// vida que verán las familias. Cada decisión y cada apertura de un documento queda en la auditoría del backend.

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstadoDeLaCola = "pendiente" | "aprobada" | "rechazada" | "vencida";
export const ESTADOS_DE_LA_COLA: EstadoDeLaCola[] = ["pendiente", "aprobada", "rechazada", "vencida"];

export async function listarCola(estado: EstadoDeLaCola = "pendiente"): Promise<VerificacionParaRevisor[]> {
  const { verificaciones } = await leerDelBackend<RespuestaDeCola>("/verificaciones", { consulta: { estado } });
  return verificaciones.map((v) => ({
    id: v.id,
    control: v.control,
    estado: v.estado,
    solicitadaEn: v.solicitadaEn,
    cuidador: { id: v.cuidador.id, nombre: v.cuidador.nombre, especialidad: v.cuidador.especialidad, zona: v.cuidador.zona },
    documentos: v.documentos.map(aDocumento),
  }));
}

export async function listarHojasPorRevisar(): Promise<HojaDeVidaPorRevisar[]> {
  const { hojasDeVida } = await leerDelBackend<RespuestaDeHojasPendientes>("/verificaciones/hojas-de-vida");
  return hojasDeVida.map((h) => ({ documento: aDocumento(h.documento), cuidador: { id: h.cuidador.id, nombre: h.cuidador.nombre } }));
}

export type DecisionDeControl = { decision: "aprobar"; vigenteHasta: string | null } | { decision: "rechazar"; motivo: string };

export function decidirControl(id: string, decision: DecisionDeControl): Promise<ResultadoDeEscritura<{ estado: string; cuidadorVisible: boolean }>> {
  const cuerpo = decision.decision === "aprobar" ? { decision: "aprobar", vigenteHasta: decision.vigenteHasta } : { decision: "rechazar", motivo: decision.motivo };
  return escribirEnBackend<RespuestaDeDecision>(`/verificaciones/${id}`, { metodo: "PATCH", cuerpo }).then((r) => (r.ok ? { ok: true as const, datos: r.datos.verificacion } : r));
}

export function decidirHojaDeVida(documentoId: string, decision: "aprobar" | "rechazar") {
  return escribirEnBackend<RespuestaDeDocumento>(`/verificaciones/documentos/${documentoId}`, { metodo: "PATCH", cuerpo: { decision } });
}

// Abre un documento privado desde el SERVIDOR (la dirección firmada dura 2 minutos y nunca llega al navegador).
export function abrirDocumentoDeRevision(documentoId: string): Promise<ResultadoDeArchivo> {
  if (!FORMATO_DE_UUID.test(documentoId)) return Promise.resolve({ tipo: "sin_archivo" });
  return descargarArchivoDelBackend(`/verificaciones/documentos/${documentoId}`, ["application/pdf", "image/jpeg", "image/png"]);
}

// El expediente de UN cuidador (M9): sus tres controles y todos los documentos que subió, para entrar desde el listado del
// panel. Sin teléfono. Cada apertura queda en la auditoría del backend; los archivos se abren aparte, uno a uno.
export interface ControlDelExpediente {
  control: ControlDeVerificacion;
  estado: EstadoDeControl;
  verificacionId: string | null;
  solicitadaEn: string | null;
  revisadoEn: string | null;
  motivoDeRechazo: string | null;
  vigenteHasta: string | null;
}

export interface ExpedienteDeCuidador {
  cuidador: Omit<RespuestaDeExpediente["cuidador"], "fotoUrl"> & { foto: string };
  controles: ControlDelExpediente[];
  documentos: DocumentoSubido[];
}

export async function obtenerExpediente(id: string): Promise<ExpedienteDeCuidador> {
  // Un identificador que no es de un cuidador ni se le pregunta al backend.
  if (!FORMATO_DE_UUID.test(id)) notFound();
  const { cuidador, controles, documentos } = await leerDelBackend<RespuestaDeExpediente>(`/verificaciones/cuidadores/${id}`);
  const { fotoUrl, ...resto } = cuidador;
  return {
    cuidador: { ...resto, foto: fotoUrl !== null ? `/api/cuidadores/${cuidador.id}/foto` : "" },
    controles,
    documentos: documentos.map(aDocumento),
  };
}

// Retira del directorio a un cuidador activo (M9): deja de mostrarse y sus servicios que aún no empezaron se cancelan con
// reembolso total. Solo administradores; queda en la auditoría del backend.
export function suspenderCuidador(id: string): Promise<ResultadoDeEscritura<{ estado: string; visible: boolean }>> {
  return escribirEnBackend<{ cuidador: { estado: string; visible: boolean } }>(`/verificaciones/cuidadores/${id}/suspension`, { metodo: "POST" }).then((r) =>
    r.ok ? { ok: true as const, datos: r.datos.cuidador } : r,
  );
}

// Lo devuelve al directorio: se muestra si tiene sus tres controles vigentes. Los servicios cancelados no se restablecen.
export function reactivarCuidador(id: string): Promise<ResultadoDeEscritura<{ estado: string; visible: boolean }>> {
  return escribirEnBackend<{ cuidador: { estado: string; visible: boolean } }>(`/verificaciones/cuidadores/${id}/reactivacion`, { metodo: "POST" }).then((r) =>
    r.ok ? { ok: true as const, datos: r.datos.cuidador } : r,
  );
}
