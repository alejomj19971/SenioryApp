import type { FinalidadDeConsentimiento } from '../../../dominio/valores-cerrados.js';

export interface Contacto {
  usuarioId: string;
  nombre: string;
  correo: string;
  telefono: string | null;
}

export interface AdultoMayorResumen {
  id: string;
  nombre: string;
  edad: number;
  fotoUrl: string | null;
}

// Lo único de Identidad que otros módulos pueden usar (E13). Todo son IDs y datos mínimos: ningún
// módulo recibe una entidad de dominio ni toca las tablas de `identidad`.
export interface ConsultaDeIdentidad {
  // Notificaciones: a quién escribir. Null si la cuenta no existe o fue eliminada.
  obtenerContacto(usuarioId: string): Promise<Contacto | null>;

  // Reservas y Teleasistencia.
  obtenerAdultoMayor(id: string): Promise<AdultoMayorResumen | null>;

  esFamiliarVinculado(
    usuarioId: string,
    adultoMayorId: string,
  ): Promise<boolean>;

  // Teleasistencia la llama en CADA acceso a datos de salud: revocar corta el acceso de inmediato.
  tieneConsentimientoVigente(
    adultoMayorId: string,
    finalidad: FinalidadDeConsentimiento,
  ): Promise<boolean>;

  // A quién avisar de una alerta.
  listarFamiliaresVinculados(adultoMayorId: string): Promise<string[]>;
}

export const CONSULTA_DE_IDENTIDAD = Symbol('ConsultaDeIdentidad');
