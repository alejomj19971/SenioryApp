import { Usuario } from '../../dominio/usuario.js';
import { RegistrarFamiliar } from './registrar-familiar.js';

// Una persona que se postula como cuidador crea su cuenta. Igual que el registro de una familia (política de datos
// aceptada, contraseña verificada, sesión iniciada), pero la cuenta nace con el rol «cuidador». El rol lo fija este
// caso de uso: no es un dato que la persona envíe, así nadie se da de alta como administrador ni como cuidador por
// el registro de familias.
//
// La cuenta, por sí sola, no da acceso a nada del directorio: el perfil se crea después, y no se muestra a las
// familias hasta que un revisor apruebe los tres controles.
export class RegistrarCuidadorPropio extends RegistrarFamiliar {
  protected override crearUsuario(
    datos: Parameters<typeof Usuario.registrarFamiliar>[0],
  ): Usuario {
    return Usuario.registrarCuidador(datos);
  }
}
