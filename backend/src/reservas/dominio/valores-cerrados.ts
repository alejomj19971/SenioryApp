// Valores con un conjunto cerrado de opciones. Son los mismos que los CHECK de la base de datos: agregar uno
// implica una migración nueva, y una prueba compara estas constantes con los CHECK.

export const ESTADOS_DE_SERVICIO = [
  'solicitado',
  'aceptado',
  'en_curso',
  'finalizado',
  'cancelado',
] as const;
export type EstadoDeServicio = (typeof ESTADOS_DE_SERVICIO)[number];

// Los estados en los que el cuidador tiene la franja comprometida: el índice único parcial de la base
// (`servicios_sin_doble_reserva`) impide dos servicios así para el mismo cuidador, fecha y jornada.
export const ESTADOS_ACTIVOS = ['solicitado', 'aceptado', 'en_curso'] as const;

export const MEDIOS_DE_PAGO = ['pasarela', 'bolsa'] as const;
export type MedioDePago = (typeof MEDIOS_DE_PAGO)[number];

export function medioDePagoDesdeTexto(texto: string): MedioDePago | null {
  return MEDIOS_DE_PAGO.find((medio) => medio === texto) ?? null;
}

// Lo que se puede hacer con un servicio. Cada una es una arista de la máquina de estados.
export const ACCIONES_DE_SERVICIO = [
  'solicitar',
  'aceptar',
  'rechazar',
  'expirar',
  'cancelar',
  'iniciar',
  'finalizar',
] as const;
export type AccionDeServicio = (typeof ACCIONES_DE_SERVICIO)[number];

// Quién hace la acción. `sistema` es la tarea programada (la expiración) o la aceptación automática.
export const ACTORES = ['familiar', 'cuidador', 'sistema'] as const;
export type ActorDeServicio = (typeof ACTORES)[number];
