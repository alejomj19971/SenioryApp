// Quién puede hacer qué con los datos de una persona mayor (E6). TODO caso de uso de Teleasistencia empieza
// por aquí: sin una respuesta afirmativa, no se toca ningún dato de salud.

export interface ActorDeTeleasistencia {
  usuarioId: string;
  rol: string;
}

// Lo que se quiere hacer:
// - `lectura`: ver medicamentos, tomas, signos y el resumen.
// - `registro`: marcar tomas y registrar lecturas.
// - `administracion`: cambiar el plan (medicamentos, rangos). Solo la familia.
// - `alerta`: pedir ayuda o atender una alerta. No es un dato clínico, así que NO exige el consentimiento de
//   datos de salud: una persona que revocó ese consentimiento igual puede pedir ayuda.
export type PermisoDeAcceso =
  'lectura' | 'registro' | 'administracion' | 'alerta';

export interface PoliticaDeAcceso {
  // Lanza RecursoNoEncontrado (404, igual que si la persona no existiera: no se revela que existe) si el actor no
  // puede, y deja el intento en la auditoría, tanto el permitido como el denegado. `accion` nombra la operación
  // para la auditoría («teleasistencia.leer_medicamentos»).
  exigir(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    permiso: PermisoDeAcceso,
    accion: string,
  ): Promise<void>;
}

export const POLITICA_DE_ACCESO = Symbol('PoliticaDeAcceso');
