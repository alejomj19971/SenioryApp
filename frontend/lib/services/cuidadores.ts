import "server-only";
import { redirect } from "next/navigation";
import { leerDelBackend, pedirAlBackend, RUTA_DE_INGRESO } from "@/lib/api/cliente-servidor";
import type {
  CuidadorDelBackend,
  FiltrosDisponiblesDelBackend,
  PaginaDeCuidadoresDelBackend,
  ResenaDelBackend,
  RespuestaDeCuidador,
} from "@/lib/api/contratos/directorio";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { descargarArchivoDelBackend } from "@/lib/services/archivos";
import { consultaDeFiltros } from "@/lib/filtros-de-cuidadores";
import type { Cuidador, CuidadorResumen, FiltrosCuidador, Resena } from "@/lib/types";

// El directorio de cuidadores sobre la API (F2). El backend solo entrega a quienes tienen sus tres controles al
// día y nunca entrega el teléfono; aquí se mapea su contrato a los tipos de las pantallas.

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PaginaDeCuidadores {
  cuidadores: CuidadorResumen[];
  // Se pasa como `cursor` para pedir la siguiente página; null si no hay más.
  siguiente: string | null;
}

export interface OpcionesDeBusqueda {
  zonas: string[];
  // La tarifa más alta entre quienes se muestran: tope del control deslizante.
  tarifaMaxima: number;
}

function aResumen(cuidador: CuidadorDelBackend): CuidadorResumen {
  const verifico = (control: CuidadorDelBackend["controlesVerificados"][number]) =>
    cuidador.controlesVerificados.includes(control);
  return {
    id: cuidador.id,
    nombre: cuidador.nombre,
    // Nunca la dirección del backend: el navegador la pide a NUESTRA ruta, que la sigue por él (como la hoja de vida).
    foto: cuidador.fotoUrl !== null ? `/api/cuidadores/${cuidador.id}/foto` : "",
    especialidad: cuidador.especialidad,
    titulo: cuidador.titulo,
    aniosExperiencia: cuidador.aniosExperiencia,
    tarifaHora: cuidador.tarifaHora,
    zona: cuidador.zona,
    disponibilidad: cuidador.disponibilidad,
    calificacion: cuidador.calificacion,
    cantidadResenas: cuidador.cantidadResenas,
    serviciosCompletados: cuidador.serviciosCompletados,
    bio: cuidador.bio,
    verificacion: {
      antecedentes: verifico("antecedentes"),
      titulos: verifico("titulos"),
      psicotecnica: verifico("psicotecnica"),
    },
  };
}

function aResena(resena: ResenaDelBackend): Resena {
  return {
    id: resena.id,
    autor: resena.autor,
    calificacion: resena.calificacion,
    comentario: resena.comentario ?? "",
    fecha: resena.fecha,
  };
}

// La búsqueda se hace en el servidor (con cursor, 20 por página): el navegador nunca recibe el catálogo entero.
export async function listarCuidadores(filtros: FiltrosCuidador = {}, cursor?: string): Promise<PaginaDeCuidadores> {
  const consulta: Record<string, string> = {};
  for (const [nombre, valor] of new URLSearchParams(consultaDeFiltros(filtros))) consulta[nombre] = valor;
  if (cursor !== undefined && cursor !== "") consulta.cursor = cursor;

  const pagina = await leerDelBackend<PaginaDeCuidadoresDelBackend>("/cuidadores", { consulta });
  return { cuidadores: pagina.cuidadores.map(aResumen), siguiente: pagina.siguiente };
}

// Null si el id no existe, **o si el cuidador no se muestra** (el backend responde 404 igual que si no existiera).
export async function obtenerCuidador(id: string): Promise<Cuidador | null> {
  if (!FORMATO_DE_UUID.test(id)) return null;
  const { cuidador } = await leerDelBackend<RespuestaDeCuidador>(`/cuidadores/${id}`);
  return { ...aResumen(cuidador), resenas: cuidador.resenas.map(aResena) };
}

export async function obtenerOpcionesDeBusqueda(): Promise<OpcionesDeBusqueda> {
  const filtros = await leerDelBackend<FiltrosDisponiblesDelBackend>("/cuidadores/filtros");
  return { zonas: filtros.zonas, tarifaMaxima: filtros.tarifaMaxima };
}

// ¿Tiene hoja de vida pública? La vista del cuidador no lo dice, así que se pregunta al backend: responde con una
// redirección a la dirección firmada (se descarta: aquí solo importa que exista) o 404 si no tiene. Un 503 (sin
// almacén de archivos) también cuenta como «no disponible»: no se ofrece un enlace que no abriría.
export async function tieneHojaDeVida(id: string): Promise<boolean> {
  if (!FORMATO_DE_UUID.test(id)) return false;
  const respuesta = await pedirAlBackend(`/cuidadores/${id}/hoja-de-vida`);
  if (respuesta.status === 401) redirect(RUTA_DE_INGRESO);
  if (respuesta.status >= 300 && respuesta.status < 400) return true;
  if (respuesta.status === 404 || respuesta.status === 503) return false;
  throw await ErrorDeApi.desdeRespuesta(respuesta);
}

export type ResultadoDeFoto =
  | { tipo: "imagen"; cuerpo: ReadableStream<Uint8Array>; tipoDeContenido: string }
  | { tipo: "sin_foto" }
  | { tipo: "no_disponible" }
  | { tipo: "sin_sesion" }
  | { tipo: "fallo" };

// Abre la foto de perfil del cuidador desde el SERVIDOR, igual que la hoja de vida: el navegador nunca ve la
// dirección del backend, ni la pública ni una externa de una importación.
export async function abrirFotoDeCuidador(id: string): Promise<ResultadoDeFoto> {
  if (!FORMATO_DE_UUID.test(id)) return { tipo: "sin_foto" };
  const resultado = await descargarArchivoDelBackend(`/cuidadores/${id}/foto`, ["image/jpeg", "image/png"]);
  switch (resultado.tipo) {
    case "archivo":
      return { tipo: "imagen", cuerpo: resultado.cuerpo, tipoDeContenido: resultado.tipoDeContenido };
    case "sin_archivo":
      return { tipo: "sin_foto" };
    default:
      return resultado;
  }
}

export type ResultadoDeHojaDeVida =
  | { tipo: "pdf"; cuerpo: ReadableStream<Uint8Array> }
  | { tipo: "sin_hoja" }
  | { tipo: "no_disponible" }
  | { tipo: "sin_sesion" }
  | { tipo: "fallo" };

// Abre el PDF de la hoja de vida desde el SERVIDOR (la entrega de archivos firmados vive en `archivos.ts`). Solo PDF: la
// hoja de vida pública lo es (M9); cualquier otra cosa no se entrega.
export async function abrirHojaDeVida(id: string): Promise<ResultadoDeHojaDeVida> {
  if (!FORMATO_DE_UUID.test(id)) return { tipo: "sin_hoja" };
  const resultado = await descargarArchivoDelBackend(`/cuidadores/${id}/hoja-de-vida`, ["application/pdf"]);
  switch (resultado.tipo) {
    case "archivo":
      return { tipo: "pdf", cuerpo: resultado.cuerpo };
    case "sin_archivo":
      return { tipo: "sin_hoja" };
    default:
      return resultado;
  }
}
