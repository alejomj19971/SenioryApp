import { ErrorDeDominio } from '../../../../compartido/dominio/errores.js';
import { CrearAdministrador } from '../../../aplicacion/casos-de-uso/crear-administrador.js';
import {
  crearAdministradorDesdeEntorno,
  ErrorDeComando,
} from './comando-crear-administrador.js';
import { ejecutarComando } from './ejecutar-comando.js';

// Comando: npm run crear-admin  (ver comando-crear-administrador.ts para las variables).
try {
  const mensaje = await ejecutarComando((aplicacion) =>
    crearAdministradorDesdeEntorno(
      process.env,
      aplicacion.get(CrearAdministrador, { strict: false }),
    ),
  );
  console.log(mensaje);
} catch (error) {
  // Los errores esperados (correo repetido, contraseña débil) se explican sin trazas.
  const esperado =
    error instanceof ErrorDeComando || error instanceof ErrorDeDominio;
  console.error(
    esperado
      ? `No se creó el administrador: ${error.message}`
      : `Falló la creación del administrador: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
