"use server";

import { revalidatePath } from "next/cache";
import { MENSAJE_DEMASIADAS_SOLICITUDES } from "@/lib/acciones/errores-de-servicio";
import type { EstadoDeFormulario } from "@/lib/acciones/estado";
import { texto } from "@/lib/acciones/validar-cuenta";
import { validarPerfil, validarVigencia } from "@/lib/acciones/validar-postulacion";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { ahoraEnColombia } from "@/lib/fecha-colombia";
import { esUbicacionValida } from "@/lib/geo";
import { exigirRol } from "@/lib/sesion";
import { actualizarMiPerfil, crearMiPerfil, obtenerMiPerfil, renovarControl, solicitarRevision } from "@/lib/services/postulacion";
import { decidirControl, decidirHojaDeVida } from "@/lib/services/verificaciones";
import type { ControlDeVerificacion } from "@/lib/types";

// Acciones de la postulación del cuidador y del panel de revisores (F9). Son endpoints públicos de Next: validan su
// entrada y el backend autoriza (rol cuidador o administrador, y cada cuidador solo toca lo suyo).

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROLES: ControlDeVerificacion[] = ["antecedentes", "titulos", "psicotecnica"];
const LARGO_MAXIMO_DEL_MOTIVO = 1000;

const MENSAJES_POR_CODIGO: Record<string, string> = {
  "revision.faltan_documentos": "Faltan documentos: sube la cédula, los antecedentes, el título y la psicotécnica antes de pedir la revisión.",
  "verificacion.falta_documento_nuevo": "Para renovar este control sube primero un documento nuevo.",
  "archivos.no_disponible": "Subir documentos no está disponible por ahora. Inténtalo de nuevo más tarde.",
};

// Del error del backend a lo que ve la persona. Los mensajes del backend ya vienen en español.
function mensajeDeErrorDePostulacion(error: ErrorDeApi): string {
  if (error.estado === 429) return MENSAJE_DEMASIADAS_SOLICITUDES;
  const propio = MENSAJES_POR_CODIGO[error.codigo];
  if (propio !== undefined) return propio;
  if (error.estado === 503) return "Esto no está disponible por ahora. Inténtalo de nuevo más tarde.";
  return error.message;
}

// Crea el perfil la primera vez y lo actualiza después: lo decide el SERVIDOR mirando si ya existe, no el formulario.
export async function guardarPerfilAccion(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  await exigirRol("cuidador");
  const existente = await obtenerMiPerfil();
  const resultadoDeValidar = validarPerfil(
    {
      especialidad: texto(datos, "especialidad"),
      titulo: texto(datos, "titulo"),
      aniosExperiencia: texto(datos, "aniosExperiencia"),
      tarifaHora: texto(datos, "tarifaHora"),
      telefono: texto(datos, "telefono"),
      zona: texto(datos, "zona"),
      disponibilidad: datos.getAll("disponibilidad").filter((v): v is string => typeof v === "string"),
      bio: texto(datos, "bio"),
    },
    { congelado: existente?.estado === "activo" },
  );
  if ("errores" in resultadoDeValidar) return { errores: resultadoDeValidar.errores, valores: resultadoDeValidar.valores };

  const resultado =
    existente === null
      ? await crearMiPerfil(resultadoDeValidar.datos as Required<typeof resultadoDeValidar.datos>)
      : await actualizarMiPerfil({ ...resultadoDeValidar.datos, aceptacionAutomatica: texto(datos, "aceptacionAutomatica") === "on" });
  if (!resultado.ok) return { mensaje: mensajeDeErrorDePostulacion(resultado.error), valores: resultadoDeValidar.valores };
  revalidatePath("/cuidador", "layout");
  return { listo: true };
}

// Fija el pin que el cuidador deja en el mapa (M2): desde dónde sale a trabajar. Las dos coordenadas son
// entrada de cualquiera (vienen del navegador, no del formulario de texto validado más arriba).
export async function guardarUbicacionAccion(latitud: number, longitud: number): Promise<EstadoDeFormulario> {
  await exigirRol("cuidador");
  if (!esUbicacionValida(latitud, longitud)) return { mensaje: "Esa ubicación no es válida." };
  const resultado = await actualizarMiPerfil({ latitud, longitud });
  if (!resultado.ok) return { mensaje: mensajeDeErrorDePostulacion(resultado.error) };
  revalidatePath("/cuidador", "layout");
  return { listo: true };
}

export async function solicitarRevisionAccion(): Promise<EstadoDeFormulario> {
  await exigirRol("cuidador");
  const resultado = await solicitarRevision();
  if (!resultado.ok) return { mensaje: mensajeDeErrorDePostulacion(resultado.error) };
  revalidatePath("/cuidador", "layout");
  return { listo: true };
}

export async function renovarControlAccion(control: string): Promise<EstadoDeFormulario> {
  await exigirRol("cuidador");
  if (!CONTROLES.includes(control as ControlDeVerificacion)) return { mensaje: "Ese control no existe." };
  const resultado = await renovarControl(control as ControlDeVerificacion);
  if (!resultado.ok) return { mensaje: mensajeDeErrorDePostulacion(resultado.error) };
  revalidatePath("/cuidador", "layout");
  return { listo: true };
}

// ── Panel de revisores ────────────────────────────────────────────────────────────────────────────────────────────

// Aprobar (con hasta cuándo vale) o rechazar (con el motivo, que ve el cuidador) un control.
export async function decidirControlAccion(verificacionId: string, _previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  await exigirRol("administrador");
  if (!FORMATO_DE_UUID.test(verificacionId)) return { mensaje: "No encontramos esa verificación." };
  const decision = texto(datos, "decision");
  if (decision === "aprobar") {
    const vigencia = texto(datos, "vigenteHasta").trim();
    const error = validarVigencia(vigencia, ahoraEnColombia().hoy);
    if (error !== undefined) return { errores: { vigenteHasta: error }, valores: { vigenteHasta: vigencia } };
    const resultado = await decidirControl(verificacionId, { decision: "aprobar", vigenteHasta: vigencia === "" ? null : vigencia });
    if (!resultado.ok) return { mensaje: mensajeDeErrorDePostulacion(resultado.error), valores: { vigenteHasta: vigencia } };
  } else if (decision === "rechazar") {
    const motivo = texto(datos, "motivo").trim();
    if (motivo === "") return { errores: { motivo: "Explica por qué se rechaza: el cuidador lo verá." }, valores: { motivo } };
    if ([...motivo].length > LARGO_MAXIMO_DEL_MOTIVO) return { errores: { motivo: `Debe tener ${LARGO_MAXIMO_DEL_MOTIVO} caracteres o menos.` }, valores: { motivo } };
    const resultado = await decidirControl(verificacionId, { decision: "rechazar", motivo });
    if (!resultado.ok) return { mensaje: mensajeDeErrorDePostulacion(resultado.error), valores: { motivo } };
  } else {
    return { mensaje: "Elige aprobar o rechazar." };
  }
  revalidatePath("/admin");
  return { listo: true };
}

export async function decidirHojaDeVidaAccion(documentoId: string, decision: "aprobar" | "rechazar"): Promise<EstadoDeFormulario> {
  await exigirRol("administrador");
  if (!FORMATO_DE_UUID.test(documentoId) || (decision !== "aprobar" && decision !== "rechazar")) return { mensaje: "No encontramos esa hoja de vida." };
  const resultado = await decidirHojaDeVida(documentoId, decision);
  if (!resultado.ok) return { mensaje: mensajeDeErrorDePostulacion(resultado.error) };
  revalidatePath("/admin");
  return { listo: true };
}
