import "server-only";
import { escribirEnBackend, leerDelBackend, type ResultadoDeEscritura } from "@/lib/api/cliente-servidor";

// El segundo factor (TOTP) de los administradores (M1, decisión 4). Nadie más lo tiene: el backend rechaza
// estas rutas para cualquier otro rol.

export interface EstadoDelSegundoFactor {
  activo: boolean;
}

export interface ConfiguracionDeSegundoFactor {
  uriDeInscripcion: string;
  secretoManual: string;
}

export const obtenerEstadoDeSegundoFactor = (): Promise<EstadoDelSegundoFactor> =>
  leerDelBackend<EstadoDelSegundoFactor>("/cuentas/yo/segundo-factor");

export const iniciarConfiguracionDeSegundoFactor = (): Promise<ResultadoDeEscritura<ConfiguracionDeSegundoFactor>> =>
  escribirEnBackend<ConfiguracionDeSegundoFactor>("/cuentas/yo/segundo-factor", { metodo: "POST" });

export const confirmarSegundoFactor = (codigo: string): Promise<ResultadoDeEscritura<undefined>> =>
  escribirEnBackend("/cuentas/yo/segundo-factor/confirmacion", { metodo: "POST", cuerpo: { codigo } });

export const desactivarSegundoFactor = (): Promise<ResultadoDeEscritura<undefined>> =>
  escribirEnBackend("/cuentas/yo/segundo-factor", { metodo: "DELETE" });
