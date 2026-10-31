import type { VistaDeUsuario } from '../../../aplicacion/vistas.js';
import type { EntradaDeAdministrador } from '../../../aplicacion/casos-de-uso/crear-administrador.js';

// Lo que `npm run crear-admin` lee del entorno. La contraseña NO se pasa como argumento (quedaría en
// el historial de la consola y en la lista de procesos): va en una variable de entorno.
export const VARIABLES_DEL_ADMINISTRADOR = [
  'ADMIN_NOMBRE',
  'ADMIN_CORREO',
  'ADMIN_CONTRASENA',
] as const;

export class ErrorDeComando extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeComando';
  }
}

export function entradaDeAdministradorDesdeEntorno(
  entorno: Record<string, string | undefined>,
): EntradaDeAdministrador {
  const faltan = VARIABLES_DEL_ADMINISTRADOR.filter(
    (nombre) => (entorno[nombre] ?? '').trim() === '',
  );
  if (faltan.length > 0) {
    throw new ErrorDeComando(
      `Faltan variables de entorno: ${faltan.join(', ')}. Ejemplo (PowerShell):\n` +
        '  $env:ADMIN_NOMBRE="Nombre Apellido"; $env:ADMIN_CORREO="admin@dominio.co"; ' +
        '$env:ADMIN_CONTRASENA="una contraseña larga"; npm run crear-admin',
    );
  }
  return {
    nombre: entorno.ADMIN_NOMBRE ?? '',
    correo: entorno.ADMIN_CORREO ?? '',
    contrasena: entorno.ADMIN_CONTRASENA ?? '',
  };
}

export interface CasoCrearAdministrador {
  ejecutar(entrada: EntradaDeAdministrador): Promise<VistaDeUsuario>;
}

// Crea el administrador y devuelve el mensaje para mostrar. Nunca incluye la contraseña.
export async function crearAdministradorDesdeEntorno(
  entorno: Record<string, string | undefined>,
  caso: CasoCrearAdministrador,
): Promise<string> {
  const administrador = await caso.ejecutar(
    entradaDeAdministradorDesdeEntorno(entorno),
  );
  return `Administrador creado: ${administrador.correo} (id ${administrador.id}).`;
}
