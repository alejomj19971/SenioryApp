"use server";

import { confirmarContratacion } from "@/lib/services/contratacion";
import type { ContratacionConfirmada, DatosContratacion, Jornada } from "@/lib/types";

export type ResultadoDeContratacion =
  | { ok: true; contratacion: ContratacionConfirmada }
  | { ok: false; mensaje: string };

const JORNADAS: readonly Jornada[] = ["manana", "tarde", "noche"];
const HORAS_MINIMAS = 1;
const HORAS_MAXIMAS = 8;

function esFechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  // Una fecha que no existe (30 de febrero) se corre al mes siguiente: no coincide al volver a escribirla.
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

// Quien llama a una acción de servidor puede mandar cualquier cosa: el formulario no es una frontera
// de seguridad. Se valida aquí, con las mismas reglas del backend (M4: de 1 a 8 horas).
function validar(datos: DatosContratacion): string | null {
  if (typeof datos.cuidadorId !== "string" || datos.cuidadorId.trim() === "") {
    return "Elige un cuidador para contratar.";
  }
  if (!Number.isInteger(datos.horas) || datos.horas < HORAS_MINIMAS || datos.horas > HORAS_MAXIMAS) {
    return `Las horas deben ser un número entero entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}.`;
  }
  if (!JORNADAS.includes(datos.jornada)) {
    return "Elige una jornada: mañana, tarde o noche.";
  }
  if (typeof datos.fecha !== "string" || !esFechaValida(datos.fecha)) {
    return "Elige una fecha válida.";
  }
  return null;
}

// Confirma la contratación en el servidor. Los errores esperados se devuelven como valor para
// mostrarlos en el formulario; lo inesperado lo atrapa `error.tsx`.
export async function confirmarContratacionAccion(
  datos: DatosContratacion,
): Promise<ResultadoDeContratacion> {
  const problema = validar(datos);
  if (problema !== null) return { ok: false, mensaje: problema };

  try {
    return { ok: true, contratacion: await confirmarContratacion(datos) };
  } catch {
    return {
      ok: false,
      mensaje: "No pudimos confirmar la contratación. Revisa los datos e inténtalo de nuevo.",
    };
  }
}
