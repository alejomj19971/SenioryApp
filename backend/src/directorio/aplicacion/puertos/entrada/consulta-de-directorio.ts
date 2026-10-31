import type { Jornada } from '../../../../compartido/dominio/jornada.js';

export interface CuidadorParaContratar {
  id: string;
  nombre: string;
  tarifaHora: number;
  zona: string;
  // En qué jornadas atiende: Reservas rechaza una jornada que no está aquí.
  disponibilidad: Jornada[];
  // Si confirma los servicios solo (true) o espera su respuesta (false).
  aceptacionAutomatica: boolean;
}

export interface ContactoDeCuidador {
  cuidadorId: string;
  // La cuenta con la que el cuidador entra (para avisarle y para el chat); null si aún no tiene cuenta.
  usuarioId: string | null;
  nombre: string;
  telefono: string;
  fotoUrl: string | null;
  especialidad: string;
}

// Lo único de Directorio que otros módulos pueden usar. Son datos mínimos: ningún módulo recibe una
// entidad de dominio ni toca las tablas de `directorio`.
export interface ConsultaDeDirectorio {
  // Reservas: para cotizar y reservar. Null si el cuidador no existe o NO está visible (suspendido, o con
  // un control vencido): una familia no puede contratar a quien no se muestra en las búsquedas.
  obtenerCuidadorParaContratar(
    cuidadorId: string,
  ): Promise<CuidadorParaContratar | null>;

  // Notificaciones y Teleasistencia: a quién avisar. A diferencia de lo anterior, no exige que esté visible:
  // un servicio ya contratado se atiende aunque después el cuidador deje de mostrarse. El teléfono es
  // privado: nunca va a la familia, solo se usa para avisos del servicio.
  obtenerContactoDeCuidador(
    cuidadorId: string,
  ): Promise<ContactoDeCuidador | null>;

  // Reservas: qué cuidador es esta cuenta (para que un cuidador acepte o rechace SUS servicios). Null si la
  // cuenta no es de un cuidador.
  obtenerCuidadorPorUsuario(
    usuarioId: string,
  ): Promise<{ cuidadorId: string } | null>;
}

export const CONSULTA_DE_DIRECTORIO = Symbol('ConsultaDeDirectorio');
