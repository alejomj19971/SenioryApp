import type { Rol } from '../../dominio/rol.js';

// Los roles viven en el dominio compartido; se reexportan aquí porque este puerto los usa.
export { ROLES, type Rol } from '../../dominio/rol.js';

// Lo declara compartido porque lo usa el guard global de autenticación (PR 5),
// pero lo implementa Identidad en M1: compartido nunca depende de un módulo de negocio.
export interface VerificadorDeTokens {
  // Lanza NoAutenticado si el token no es válido, venció o fue revocado.
  verificar(token: string): Promise<UsuarioAutenticado>;
}

export interface UsuarioAutenticado {
  id: string;
  rol: Rol;
}

export const VERIFICADOR_DE_TOKENS = Symbol('VerificadorDeTokens');
