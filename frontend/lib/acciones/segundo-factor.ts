"use server";

import { revalidatePath } from "next/cache";
import { MENSAJE_DEMASIADAS_SOLICITUDES } from "@/lib/acciones/errores-de-servicio";
import type { EstadoDeFormulario } from "@/lib/acciones/estado";
import { texto } from "@/lib/acciones/validar-cuenta";
import type { ErrorDeApi } from "@/lib/api/error-de-api";
import { exigirRol } from "@/lib/sesion";
import {
  confirmarSegundoFactor,
  desactivarSegundoFactor,
  iniciarConfiguracionDeSegundoFactor,
} from "@/lib/services/segundo-factor";

// La activación del segundo factor del propio administrador (M1, decisión 4). Son dos pasos: generar el
// secreto (código QR) y confirmarlo con un código real, antes de que el login lo exija.

export interface EstadoDeConfiguracion extends EstadoDeFormulario {
  uriDeInscripcion?: string;
  secretoManual?: string;
}

function mensajeDeError(error: ErrorDeApi): string {
  return error.estado === 429 ? MENSAJE_DEMASIADAS_SOLICITUDES : error.message;
}

// Sin campos propios: genera el secreto y lo entrega para mostrarlo como código QR.
export async function iniciarSegundoFactorAccion(): Promise<EstadoDeConfiguracion> {
  await exigirRol("administrador");
  const resultado = await iniciarConfiguracionDeSegundoFactor();
  if (!resultado.ok) return { mensaje: mensajeDeError(resultado.error) };
  return { uriDeInscripcion: resultado.datos.uriDeInscripcion, secretoManual: resultado.datos.secretoManual };
}

// Confirma que la app autenticadora quedó bien configurada: desde aquí el login exige el código.
export async function confirmarSegundoFactorAccion(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  await exigirRol("administrador");
  const codigo = texto(datos, "codigo").trim();
  if (codigo === "") return { errores: { codigo: "Escribe el código." } };

  const resultado = await confirmarSegundoFactor(codigo);
  if (!resultado.ok) return { mensaje: mensajeDeError(resultado.error) };
  revalidatePath("/admin/seguridad");
  return { listo: true };
}

// Como acción directa de un `<form>` (sin `useActionState`: no hay campos ni estado que mostrar). Un fallo
// sube al límite de error del panel: no debería pasar (es un DELETE sin datos que puedan estar mal).
export async function desactivarSegundoFactorAccion(): Promise<void> {
  await exigirRol("administrador");
  const resultado = await desactivarSegundoFactor();
  if (!resultado.ok) throw resultado.error;
  revalidatePath("/admin/seguridad");
}
