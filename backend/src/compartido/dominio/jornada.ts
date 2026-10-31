// Las tres franjas del día en que se presta un servicio. Las mismas que el CHECK de
// `directorio.cuidadores.disponibilidad` y de `reservas.servicios.jornada`. Viven en el dominio compartido
// porque las usan Directorio (disponibilidad del cuidador) y Reservas (franja del servicio), y el dominio
// de un módulo no puede importar el de otro.
export const JORNADAS = ['manana', 'tarde', 'noche'] as const;

export type Jornada = (typeof JORNADAS)[number];

export function esJornada(texto: string): texto is Jornada {
  return (JORNADAS as readonly string[]).includes(texto);
}
