import { ErrorDeDominio } from '../../../../compartido/dominio/errores.js';
import { ErrorDeComando } from './comando-crear-administrador.js';
import { dependenciasDeSemillas } from './dependencias-de-semillas.js';
import { ejecutarComando } from './ejecutar-comando.js';
import { sembrarIdentidad } from './semillas-de-identidad.js';

// Comando: npm run semillas  (datos de ejemplo de desarrollo; se niega a correr en producción).
try {
  const mensajes = await ejecutarComando((aplicacion) =>
    sembrarIdentidad(process.env, dependenciasDeSemillas(aplicacion)),
  );
  for (const mensaje of mensajes) console.log(mensaje);
} catch (error) {
  const esperado =
    error instanceof ErrorDeComando || error instanceof ErrorDeDominio;
  console.error(
    esperado
      ? `No se sembraron los datos: ${error.message}`
      : `Falló la siembra: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
