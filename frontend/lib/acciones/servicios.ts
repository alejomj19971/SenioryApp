"use server";

import { revalidatePath } from "next/cache";
import { mensajeDeErrorDeServicio } from "@/lib/acciones/errores-de-servicio";
import {
  actuarComoCuidador,
  calificarServicio,
  cancelarServicio,
  cotizar,
  listarServiciosDeLaFamilia,
  solicitarServicio,
  type PaginaDeServicios,
  type AccionDelCuidador,
} from "@/lib/services/servicios";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import type { Cotizacion, DatosDeSolicitud, Jornada, MedioDePago, Servicio } from "@/lib/types";

// Acciones de servicios (F3+F4). Son endpoints públicos de Next: validan su entrada y dejan que el backend
// autorice (un servicio ajeno responde 404). El dinero NUNCA viene del navegador: lo calcula el servidor.

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JORNADAS: readonly Jornada[] = ["manana", "tarde", "noche"];
const MEDIOS: readonly MedioDePago[] = ["pasarela", "bolsa"];
const ACCIONES_DEL_CUIDADOR: readonly AccionDelCuidador[] = ["aceptar", "rechazar", "iniciar", "finalizar"];
const HORAS_MINIMAS = 1;
const HORAS_MAXIMAS = 8;

function esFechaValida(texto: unknown): texto is string {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  // Una fecha que no existe (30 de febrero) se corre al mes siguiente: no coincide al volver a escribirla.
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

const esHoras = (valor: unknown): valor is number =>
  typeof valor === "number" && Number.isInteger(valor) && valor >= HORAS_MINIMAS && valor <= HORAS_MAXIMAS;

const MENSAJE_DE_HORAS = `Las horas deben ser un número entero entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}.`;

export type ResultadoDeCotizacion = { ok: true; cotizacion: Cotizacion } | { ok: false; mensaje: string };

// La vista previa del precio: la calcula el servidor con la tarifa del cuidador y la política vigente.
export async function cotizarServicio(cuidadorId: unknown, horas: unknown): Promise<ResultadoDeCotizacion> {
  if (typeof cuidadorId !== "string" || !FORMATO_DE_UUID.test(cuidadorId)) return { ok: false, mensaje: "Elige un cuidador para contratar." };
  if (!esHoras(horas)) return { ok: false, mensaje: MENSAJE_DE_HORAS };
  const resultado = await cotizar(cuidadorId, horas);
  return resultado.ok ? { ok: true, cotizacion: resultado.datos } : { ok: false, mensaje: mensajeDeErrorDeServicio(resultado.error) };
}

export type ResultadoDeSolicitud = { ok: true; servicioId: string } | { ok: false; mensaje: string };

function validarSolicitud(datos: unknown): { datos: DatosDeSolicitud } | { mensaje: string } {
  const d = (typeof datos === "object" && datos !== null ? datos : {}) as Record<string, unknown>;
  if (typeof d.cuidadorId !== "string" || !FORMATO_DE_UUID.test(d.cuidadorId)) return { mensaje: "Elige un cuidador para contratar." };
  if (!esHoras(d.horas)) return { mensaje: MENSAJE_DE_HORAS };
  if (typeof d.jornada !== "string" || !JORNADAS.includes(d.jornada as Jornada)) return { mensaje: "Elige una franja: mañana, tarde o noche." };
  if (!esFechaValida(d.fecha)) return { mensaje: "Elige una fecha válida." };
  if (typeof d.medioDePago !== "string" || !MEDIOS.includes(d.medioDePago as MedioDePago)) return { mensaje: "Elige cómo vas a pagar." };
  return {
    datos: { cuidadorId: d.cuidadorId, fecha: d.fecha, jornada: d.jornada as Jornada, horas: d.horas, medioDePago: d.medioDePago as MedioDePago },
  };
}

// Pide el servicio. La persona a cuidar sale de la SESIÓN, no del formulario: nadie puede pedir un servicio para
// la persona de otra familia con un campo alterado. `clave` es la Idempotency-Key: el formulario la genera al
// montarse (y la cambia si cambian los datos), así reenviar por una mala conexión no pide dos veces.
export async function solicitarServicioAccion(datos: unknown, clave: unknown): Promise<ResultadoDeSolicitud> {
  const validacion = validarSolicitud(datos);
  if ("mensaje" in validacion) return { ok: false, mensaje: validacion.mensaje };
  if (typeof clave !== "string" || clave.length < 8 || clave.length > 100) {
    return { ok: false, mensaje: "No pudimos enviar la solicitud. Recarga la página e inténtalo de nuevo." };
  }

  const { persona } = await exigirFamiliaLista();
  const resultado = await solicitarServicio(persona.id, validacion.datos, clave);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeServicio(resultado.error) };
  revalidatePath("/app/servicios");
  return { ok: true, servicioId: resultado.datos.id };
}

export type ResultadoSimple = { ok: true } | { ok: false; mensaje: string };

function idValido(id: unknown): id is string {
  return typeof id === "string" && FORMATO_DE_UUID.test(id);
}

export async function cancelarServicioAccion(servicioId: unknown): Promise<ResultadoSimple> {
  if (!idValido(servicioId)) return { ok: false, mensaje: "No encontramos ese servicio." };
  const resultado = await cancelarServicio(servicioId);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeServicio(resultado.error) };
  revalidatePath("/app/servicios");
  revalidatePath(`/app/servicios/${servicioId}`);
  return { ok: true };
}

export async function calificarServicioAccion(servicioId: unknown, calificacion: unknown, comentario: unknown): Promise<ResultadoSimple> {
  if (!idValido(servicioId)) return { ok: false, mensaje: "No encontramos ese servicio." };
  if (typeof calificacion !== "number" || !Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return { ok: false, mensaje: "Elige de 1 a 5 estrellas." };
  }
  const texto = typeof comentario === "string" ? comentario : "";
  if (texto.length > 500) return { ok: false, mensaje: "El comentario debe tener 500 caracteres o menos." };
  const resultado = await calificarServicio(servicioId, calificacion, texto);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeServicio(resultado.error) };
  revalidatePath(`/app/servicios/${servicioId}`);
  return { ok: true };
}

// Aceptar, rechazar, iniciar y finalizar: solo el cuidador del servicio (el backend lo verifica).
export async function actuarServicioAccion(servicioId: unknown, accion: unknown): Promise<ResultadoSimple> {
  if (!idValido(servicioId)) return { ok: false, mensaje: "No encontramos ese servicio." };
  if (typeof accion !== "string" || !ACCIONES_DEL_CUIDADOR.includes(accion as AccionDelCuidador)) {
    return { ok: false, mensaje: "Esa acción no existe." };
  }
  const resultado = await actuarComoCuidador(servicioId, accion as AccionDelCuidador);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeServicio(resultado.error) };
  revalidatePath("/cuidador");
  return { ok: true };
}

export type ResultadoDeMasServicios = { ok: true; pagina: PaginaDeServicios<Servicio> } | { ok: false; mensaje: string };

// «Ver más» de «Mis servicios»: la página siguiente con el cursor del backend (que rechaza uno que no sea suyo).
export async function cargarMasServiciosAccion(cursor: unknown): Promise<ResultadoDeMasServicios> {
  if (typeof cursor !== "string" || cursor === "" || cursor.length > 500) return { ok: false, mensaje: "No pudimos cargar más servicios. Recarga la página." };
  try {
    return { ok: true, pagina: await listarServiciosDeLaFamilia(undefined, cursor) };
  } catch (error) {
    if (error instanceof ErrorDeApi) return { ok: false, mensaje: mensajeDeErrorDeServicio(error) };
    throw error;
  }
}
