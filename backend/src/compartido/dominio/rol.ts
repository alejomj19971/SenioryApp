// Roles de las personas que usan Seniory. Los mismos valores que el CHECK de `identidad.usuarios.rol`.
// Viven en el dominio compartido porque los usan Identidad (que los asigna) y el guard global de la
// capa HTTP (que los exige), y el dominio de un módulo no puede importar la capa de aplicación de otro.
export const ROLES = [
  'familiar',
  'adulto_mayor',
  'cuidador',
  'administrador',
] as const;

export type Rol = (typeof ROLES)[number];

export function esRol(texto: string): texto is Rol {
  return (ROLES as readonly string[]).includes(texto);
}
