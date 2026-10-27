// Registro de quién hizo qué sobre qué recurso (tabla `compartido.auditoria`, de solo inserción).
// Se escribe FUERA de la transacción del caso de uso, para que un acceso denegado quede registrado
// aunque la operación falle (E6). Adaptador en el PR 4.
export interface Auditoria {
  registrar(entrada: EntradaDeAuditoria): Promise<void>;
}

export interface EntradaDeAuditoria {
  actorId: string | null; // null si lo hizo el sistema (una tarea programada)
  accion: string; // «modulo.verbo_objeto», por ejemplo 'teleasistencia.leer_signos'
  recursoTipo: string;
  recursoId: string | null;
  resultado: ResultadoDeAuditoria;
  metadatos?: Record<string, string | number | boolean>; // solo IDs y valores; sin datos personales
}

export type ResultadoDeAuditoria = 'permitido' | 'denegado' | 'error';

export const AUDITORIA = Symbol('Auditoria');
