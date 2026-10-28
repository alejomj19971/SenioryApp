import type { Correo } from '../../../dominio/correo.js';
import type { UsuarioId } from '../../../dominio/ids.js';
import type { Usuario } from '../../../dominio/usuario.js';

// Persistencia de usuarios con su credencial (un solo agregado). Todos los repositorios de Identidad
// usan la transacción de la unidad de trabajo en curso, si la hay.
export interface RepositorioUsuarios {
  // Guarda un usuario nuevo con su credencial, juntos o ninguno.
  // Lanza ConflictoDeEstado (`usuario.correo_ya_registrado`) si el correo ya existe, sin distinguir
  // mayúsculas.
  guardar(usuario: Usuario): Promise<void>;

  // Guarda los cambios del usuario y de su credencial (perfil, contador de fallos, hash).
  // Lanza RecursoNoEncontrado si el usuario no existe.
  actualizar(usuario: Usuario): Promise<void>;

  buscarPorId(id: UsuarioId): Promise<Usuario | null>;
  buscarPorCorreo(correo: Correo): Promise<Usuario | null>;

  // Igual que `buscarPorCorreo`, pero bloquea la credencial hasta que termine la transacción. Es lo
  // que usa el inicio de sesión: así varios intentos simultáneos con la misma cuenta se atienden uno
  // tras otro y ninguno se pierde en el contador de fallos. Debe llamarse dentro de una unidad de
  // trabajo.
  buscarPorCorreoParaActualizar(correo: Correo): Promise<Usuario | null>;
}

export const REPOSITORIO_USUARIOS = Symbol('RepositorioUsuarios');
