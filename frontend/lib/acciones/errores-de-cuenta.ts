import { ErrorDeApi } from "@/lib/api/error-de-api";
import type { EstadoDeFormulario } from "@/lib/acciones/estado";

// Del error del backend al mensaje que ve la persona en un formulario de cuenta (F1 §4.4). Sin `server-only`:
// es una función pura. Los mensajes del backend ya vienen en español; aquí se ubican (en el campo o en la
// pantalla) y se reemplazan los que conviene decir con otras palabras.

export const MENSAJE_DEMASIADOS_INTENTOS =
  "Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
export const MENSAJE_NO_DISPONIBLE = "Esto no está disponible por ahora. Inténtalo de nuevo más tarde.";
export const MENSAJE_CREDENCIALES = "El correo o la contraseña no son correctos.";
export const MENSAJE_CORREO_REGISTRADO = "Ya existe una cuenta con ese correo. ¿Quieres ingresar?";
export const MENSAJE_ENLACE_NO_VALIDO = "El enlace ya no es válido o venció. Pide uno nuevo.";

// Campo del formulario al que pertenece cada código de dominio (los campos de validación del DTO ya traen el suyo).
const CAMPO_POR_PREFIJO: [string, string][] = [
  ["contrasena.actual", "contrasenaActual"],
  ["contrasena.", "contrasena"],
  ["correo.", "correo"],
  ["nombre.", "nombre"],
  ["telefono.", "telefono"],
  ["parentesco.", "parentesco"],
  ["fecha.", "fecha"],
  ["adulto_mayor.edad", "fecha"],
  ["adulto_mayor.fecha", "fecha"],
];

// El nombre de un campo del backend a uno del formulario.
const CAMPO_DEL_FORMULARIO: Record<string, string> = {
  contrasenaNueva: "contrasena",
  fechaDeNacimiento: "fecha",
  versionPolitica: "aceptaPolitica",
};

export function estadoDeError(error: ErrorDeApi, valores?: Record<string, string>): EstadoDeFormulario {
  const estado = (extra: Omit<EstadoDeFormulario, "valores">): EstadoDeFormulario => ({
    ...extra,
    ...(valores === undefined ? {} : { valores }),
  });

  if (error.estado === 429) return estado({ mensaje: MENSAJE_DEMASIADOS_INTENTOS });
  if (error.estado === 503) return estado({ mensaje: MENSAJE_NO_DISPONIBLE });
  if (error.codigo === "auth.credenciales_invalidas") return estado({ mensaje: MENSAJE_CREDENCIALES });
  if (error.codigo === "usuario.correo_ya_registrado") {
    return estado({ errores: { correo: MENSAJE_CORREO_REGISTRADO } });
  }
  if (error.codigo === "recuperacion.enlace_no_valido") return estado({ mensaje: MENSAJE_ENLACE_NO_VALIDO });

  if (error.errores.length > 0) {
    const errores: Record<string, string> = {};
    for (const { campo, mensaje } of error.errores) {
      errores[CAMPO_DEL_FORMULARIO[campo] ?? campo] ??= mensaje;
    }
    return estado({ errores });
  }

  const campo = CAMPO_POR_PREFIJO.find(([prefijo]) => error.codigo.startsWith(prefijo))?.[1];
  if (campo !== undefined) return estado({ errores: { [campo]: error.message } });

  return estado({ mensaje: error.message });
}
