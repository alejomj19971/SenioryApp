"use server";

import { revalidatePath } from "next/cache";
import type { ErrorDeApi } from "@/lib/api/error-de-api";
import { estadoDeError } from "@/lib/acciones/errores-de-cuenta";
import { mensajeDeErrorDeServicio } from "@/lib/acciones/errores-de-servicio";
import type { EstadoDeFormulario } from "@/lib/acciones/estado";
import { texto } from "@/lib/acciones/validar-cuenta";
import { validarLectura, validarMedicamento } from "@/lib/acciones/validar-teleasistencia";
import { cambiarToma, desactivarMedicamento, enviarAlerta, registrarLectura, registrarMedicamento } from "@/lib/services/teleasistencia";
import type { AlertaEnviada } from "@/lib/types";

// Acciones de teleasistencia (F6). Son endpoints públicos de Next: validan su entrada y el backend autoriza (una
// persona ajena responde 404). La persona sale de la SESIÓN, nunca de lo que mande el navegador.

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidarTeleasistencia() {
  revalidatePath("/app");
  revalidatePath("/app/teleasistencia");
  revalidatePath("/app/teleasistencia/medicamentos");
}

export type ResultadoSimple = { ok: true } | { ok: false; mensaje: string };

// «Ya se tomó» / «Deshacer». Dos pantallas a la vez pueden chocar: una gana y la otra recibe 409 (la pantalla se
// actualiza sola y lo dice).
export async function marcarTomaAccion(medicamentoId: unknown, tomaId: unknown, estado: unknown): Promise<ResultadoSimple> {
  if (typeof medicamentoId !== "string" || !FORMATO_DE_UUID.test(medicamentoId) || typeof tomaId !== "string" || !FORMATO_DE_UUID.test(tomaId)) {
    return { ok: false, mensaje: "No encontramos esa toma." };
  }
  if (estado !== "tomada" && estado !== "pendiente") return { ok: false, mensaje: "Esa acción no existe." };
  const resultado = await cambiarToma(medicamentoId, tomaId, estado);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeTeleasistencia(resultado.error) };
  revalidarTeleasistencia();
  return { ok: true };
}

export async function registrarMedicamentoAccion(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const validacion = validarMedicamento({
    nombre: texto(datos, "nombre"),
    dosis: texto(datos, "dosis"),
    indicaciones: texto(datos, "indicaciones"),
    horarios: datos.getAll("horario").filter((valor): valor is string => typeof valor === "string"),
  });
  if ("errores" in validacion) return { errores: validacion.errores, valores: validacion.valores };

  const resultado = await registrarMedicamento(validacion.datos);
  if (!resultado.ok) return estadoDeError(resultado.error, validacion.valores);
  revalidarTeleasistencia();
  return { listo: true };
}

export async function desactivarMedicamentoAccion(medicamentoId: unknown): Promise<ResultadoSimple> {
  if (typeof medicamentoId !== "string" || !FORMATO_DE_UUID.test(medicamentoId)) return { ok: false, mensaje: "No encontramos ese medicamento." };
  const resultado = await desactivarMedicamento(medicamentoId);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeTeleasistencia(resultado.error) };
  revalidarTeleasistencia();
  return { ok: true };
}

export async function registrarLecturaAccion(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const validacion = validarLectura({
    presionSistolica: texto(datos, "presionSistolica"),
    presionDiastolica: texto(datos, "presionDiastolica"),
    frecuenciaCardiaca: texto(datos, "frecuenciaCardiaca"),
    glucosa: texto(datos, "glucosa"),
  });
  if ("errores" in validacion) return { errores: validacion.errores, valores: validacion.valores };

  const resultado = await registrarLectura(validacion.datos);
  if (!resultado.ok) return estadoDeError(resultado.error, validacion.valores);
  revalidarTeleasistencia();
  return { listo: true };
}

export type ResultadoDeAlerta = { ok: true; alerta: AlertaEnviada } | { ok: false; mensaje: string };

// Pedir ayuda. `clave` la genera la pantalla al empezar la cuenta regresiva: si falla y se reintenta, es la misma
// alerta y no se avisa dos veces. El resultado dice A QUIÉN se avisó de verdad.
export async function enviarAlertaAccion(origen: unknown, clave: unknown): Promise<ResultadoDeAlerta> {
  if (origen !== "boton" && origen !== "voz") return { ok: false, mensaje: "No pudimos enviar la alerta." };
  if (typeof clave !== "string" || clave.length < 8 || clave.length > 100) {
    return { ok: false, mensaje: "No pudimos enviar la alerta. Recarga la página e inténtalo de nuevo." };
  }
  const resultado = await enviarAlerta(origen, clave);
  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeTeleasistencia(resultado.error) };
  revalidarTeleasistencia();
  return { ok: true, alerta: resultado.datos };
}

// Los mensajes que más importan en esta pantalla, con otras palabras.
const MENSAJES: Record<string, string> = {
  "toma.fuera_de_dia": "Esa toma es de otro día: solo se puede marcar el día que le corresponde.",
  "toma.ya_tomada": "Esa toma ya estaba marcada. Actualizamos la pantalla.",
  "toma.no_pendiente": "Esa toma ya cambió en otra pantalla. Actualizamos la pantalla.",
  "toma.no_esta_tomada": "Esa toma ya cambió en otra pantalla. Actualizamos la pantalla.",
};

function mensajeDeErrorDeTeleasistencia(error: ErrorDeApi): string {
  if (error.estado === 409) return MENSAJES[error.codigo] ?? "Esto ya cambió en otra pantalla. Actualizamos la pantalla.";
  return MENSAJES[error.codigo] ?? mensajeDeErrorDeServicio(error);
}
