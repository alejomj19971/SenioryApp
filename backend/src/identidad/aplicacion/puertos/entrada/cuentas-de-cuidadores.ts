export interface DatosDeCuentaDeCuidador {
  nombre: string;
  correo: string;
  telefono?: string | null;
}

// Lo que Directorio necesita de Identidad para cargar a un cuidador ya verificado: su cuenta, con rol
// «cuidador». No se entrega contraseña: la cuenta nace con una aleatoria que nadie conoce, y la persona
// define la suya con «Olvidé mi contraseña» cuando se le entregue el acceso.
export interface CuentasDeCuidadores {
  // Lanza ConflictoDeEstado (`usuario.correo_ya_registrado`) si el correo ya tiene cuenta. Se une a la
  // transacción en curso, si la hay: la cuenta y el cuidador se guardan juntos o no se guarda nada.
  crearCuentaDeCuidador(
    datos: DatosDeCuentaDeCuidador,
  ): Promise<{ usuarioId: string }>;
}

export const CUENTAS_DE_CUIDADORES = Symbol('CuentasDeCuidadores');
