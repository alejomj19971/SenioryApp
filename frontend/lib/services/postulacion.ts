import "server-only";
import { escribirEnBackend, pedirAlBackend, RUTA_DE_INGRESO, type ResultadoDeEscritura } from "@/lib/api/cliente-servidor";
import type { DocumentoDelBackend, MiPerfilDelBackend, RespuestaDeDocumento, RespuestaDeMiPerfil } from "@/lib/api/contratos/verificacion";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { redirect } from "next/navigation";
import type { DatosDePerfil } from "@/lib/acciones/validar-postulacion";
import { descargarArchivoDelBackend, type ResultadoDeArchivo } from "@/lib/services/archivos";
import type { ControlDeVerificacion, DocumentoSubido, MiPerfilDeCuidador, TipoDeDocumento } from "@/lib/types";

// La postulación del propio cuidador (M9) sobre la API: arma su perfil, sube sus documentos y pide la revisión. Cada
// cuenta de cuidador ve únicamente lo suyo (no hay ningún id de otra persona en estas rutas).

// 5 MB cada archivo, el mismo tope que el backend; subirlo tarda más que una consulta.
export const TAMANO_MAXIMO_DE_DOCUMENTO = 5 * 1024 * 1024;
// 3 MB para la foto de perfil, el mismo tope que el backend.
export const TAMANO_MAXIMO_DE_FOTO = 3 * 1024 * 1024;
const TIEMPO_MAXIMO_DE_SUBIDA_MS = 30_000;

export const aDocumento = (d: DocumentoDelBackend): DocumentoSubido => ({
  id: d.id,
  tipo: d.tipo,
  nombre: d.nombre,
  estado: d.estado,
  tamanoBytes: d.tamanoBytes,
  subidoEn: d.subidoEn,
});

function aMiPerfil(p: MiPerfilDelBackend): MiPerfilDeCuidador {
  return {
    id: p.id,
    nombre: p.nombre,
    fotoUrl: p.fotoUrl,
    especialidad: p.especialidad,
    titulo: p.titulo,
    aniosExperiencia: p.aniosExperiencia,
    tarifaHora: p.tarifaHora,
    telefono: p.telefono,
    zona: p.zona,
    disponibilidad: p.disponibilidad,
    bio: p.bio,
    aceptacionAutomatica: p.aceptacionAutomatica,
    estado: p.estado,
    visible: p.visible,
    controles: p.controles.map((c) => ({ control: c.control, estado: c.estado, motivoDeRechazo: c.motivoDeRechazo, vigenteHasta: c.vigenteHasta, puedeRenovar: c.puedeRenovar })),
    documentos: p.documentos.map(aDocumento),
  };
}

// Null si todavía no armó su perfil (la cuenta existe, el perfil no).
export async function obtenerMiPerfil(): Promise<MiPerfilDeCuidador | null> {
  const respuesta = await pedirAlBackend("/cuidadores/yo");
  if (respuesta.status === 401) redirect(RUTA_DE_INGRESO);
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw await ErrorDeApi.desdeRespuesta(respuesta);
  return aMiPerfil(((await respuesta.json()) as RespuestaDeMiPerfil).perfil);
}

async function comoPerfil(resultado: Promise<ResultadoDeEscritura<RespuestaDeMiPerfil>>): Promise<ResultadoDeEscritura<MiPerfilDeCuidador>> {
  const r = await resultado;
  return r.ok ? { ok: true, datos: aMiPerfil(r.datos.perfil) } : r;
}

export const crearMiPerfil = (datos: DatosDePerfil) => comoPerfil(escribirEnBackend<RespuestaDeMiPerfil>("/cuidadores/yo", { metodo: "POST", cuerpo: datos }));

// Solo lo que cambia (un perfil activo no puede cambiar su especialidad ni su título).
export const actualizarMiPerfil = (cambios: Partial<DatosDePerfil> & { aceptacionAutomatica?: boolean }) =>
  comoPerfil(escribirEnBackend<RespuestaDeMiPerfil>("/cuidadores/yo", { metodo: "PATCH", cuerpo: cambios }));

export const solicitarRevision = () => comoPerfil(escribirEnBackend<RespuestaDeMiPerfil>("/cuidadores/yo/revision", { metodo: "POST" }));

export const renovarControl = (control: ControlDeVerificacion) =>
  comoPerfil(escribirEnBackend<RespuestaDeMiPerfil>(`/cuidadores/yo/verificaciones/${control}/renovacion`, { metodo: "POST" }));

// Sube un documento: el archivo viaja como el CUERPO de la petición. El backend mira el contenido (PDF, JPEG o PNG; la
// hoja de vida solo PDF) y vuelve a comprobar el tamaño.
export async function subirDocumento(tipo: TipoDeDocumento, contenido: Uint8Array<ArrayBuffer>, tipoDeContenido: string, nombre: string): Promise<ResultadoDeEscritura<DocumentoSubido>> {
  const resultado = await escribirEnBackend<RespuestaDeDocumento>(`/cuidadores/yo/documentos/${tipo}`, {
    metodo: "PUT",
    archivo: { contenido, tipo: tipoDeContenido, nombre },
    tiempoMaximoMs: TIEMPO_MAXIMO_DE_SUBIDA_MS,
  });
  return resultado.ok ? { ok: true, datos: aDocumento(resultado.datos.documento) } : resultado;
}

// Sube (o reemplaza) la foto de perfil: JPEG o PNG. Se muestra de inmediato a las familias, sin revisión.
export const subirFoto = (contenido: Uint8Array<ArrayBuffer>, tipoDeContenido: string) =>
  comoPerfil(escribirEnBackend<RespuestaDeMiPerfil>("/cuidadores/yo/foto", { metodo: "PUT", archivo: { contenido, tipo: tipoDeContenido }, tiempoMaximoMs: TIEMPO_MAXIMO_DE_SUBIDA_MS }));

// Abre la foto de perfil PROPIA, igual que la de un cuidador cualquiera (`archivos.ts`), pero sin exigir que el
// perfil ya se muestre a las familias: la ve mientras lo arma.
export const abrirFotoPropia = (): Promise<ResultadoDeArchivo> => descargarArchivoDelBackend("/cuidadores/yo/foto", ["image/jpeg", "image/png"]);
