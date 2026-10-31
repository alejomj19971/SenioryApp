import {
  RELOJ,
  type Reloj,
} from '../../../../compartido/aplicacion/puertos/reloj.js';
import { ErrorDeDominio } from '../../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import { CONFIGURACION } from '../../../../configuracion/configuracion.module.js';
import type { Configuracion } from '../../../../configuracion/variables-de-entorno.js';
import { ImportarCuidador } from '../../../aplicacion/casos-de-uso/importar-cuidador.js';
import { ErrorDeArchivo } from './comando-importar-cuidadores.js';
import { ejecutarComando } from './ejecutar-comando.js';
import { sembrarDirectorio } from './semillas-de-directorio.js';

// Comando: npm run semillas  (después de las de Identidad). Cuidadores de ejemplo para desarrollo; se niega a
// correr en producción.
try {
  const mensajes = await ejecutarComando((aplicacion) => {
    const reloj = aplicacion.get<Reloj>(RELOJ, { strict: false });
    const configuracion = aplicacion.get<Configuracion>(CONFIGURACION, {
      strict: false,
    });
    return sembrarDirectorio(
      process.env,
      aplicacion.get(ImportarCuidador, { strict: false }),
      FechaCivil.hoy(reloj, configuracion.zonaHorariaNegocio),
    );
  });
  for (const mensaje of mensajes) console.log(mensaje);
} catch (error) {
  const esperado =
    error instanceof ErrorDeArchivo || error instanceof ErrorDeDominio;
  console.error(
    esperado
      ? `No se sembraron los cuidadores: ${error.message}`
      : `Falló la siembra de cuidadores: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
