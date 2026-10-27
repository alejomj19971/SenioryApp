// Lo declara compartido porque lo usa el guard global de autenticación (PR 5),
// pero lo implementa Identidad en M1: compartido nunca depende de un módulo de negocio.
export interface VerificadorDeTokens {
  // Lanza NoAutenticado si el token no es válido, venció o fue revocado.
  verificar(token: string): Promise<UsuarioAutenticado>;
}

// Los mismos valores que el CHECK de `identidad.usuarios.rol`.
export const ROLES = [
  'familiar',
  'adulto_mayor',
  'cuidador',
  'administrador',
] as const;
export type Rol = (typeof ROLES)[number];

export interface UsuarioAutenticado {
  id: string;
  rol: Rol;
}

export const VERIFICADOR_DE_TOKENS = Symbol('VerificadorDeTokens');
