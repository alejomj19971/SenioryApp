import type { Rol } from '../../compartido/dominio/rol.js';
import type { Usuario } from '../dominio/usuario.js';

// Lo que se muestra de un usuario hacia afuera: nunca la credencial.
export interface VistaDeUsuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
}

export function vistaDeUsuario(usuario: Usuario): VistaDeUsuario {
  return {
    id: usuario.id,
    nombre: usuario.nombre.valor,
    correo: usuario.correo.valor,
    rol: usuario.rol,
  };
}
