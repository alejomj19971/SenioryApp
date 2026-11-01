// Lo que una acción de cuenta devuelve al formulario (`useActionState`). Los errores esperados viajan como valor;
// un éxito normalmente redirige y no devuelve nada.
export interface EstadoDeFormulario {
  // Error de la pantalla (no de un campo): «correo o contraseña incorrectos», «demasiados intentos»…
  mensaje?: string;
  // Error por campo, junto a cada campo.
  errores?: Record<string, string>;
  // Lo que la persona escribió, para no hacerla repetirlo (NUNCA una contraseña).
  valores?: Record<string, string>;
  // Éxito sin redirección (por ejemplo, «te enviamos el enlace»).
  listo?: boolean;
}

export const ESTADO_INICIAL: EstadoDeFormulario = {};
