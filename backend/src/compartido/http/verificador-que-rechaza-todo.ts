import type {
  UsuarioAutenticado,
  VerificadorDeTokens,
} from '../aplicacion/puertos/verificador-de-tokens.js';
import { NoAutenticado } from '../dominio/errores.js';

// Verificador de M0, mientras Identidad (M1) no exista: ninguna sesión es válida, así que toda ruta
// no pública responde 401. Falla cerrado: nunca deja pasar a nadie. M1 lo reemplaza por el real.
export class VerificadorQueRechazaTodo implements VerificadorDeTokens {
  verificar(): Promise<UsuarioAutenticado> {
    return Promise.reject(new NoAutenticado());
  }
}
