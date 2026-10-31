import { ErrorDeDominio } from '../../../../compartido/dominio/errores.js';
import {
  CONSULTA_DE_IDENTIDAD,
  type ConsultaDeIdentidad,
} from '../../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import { ImportarCuidador } from '../../../aplicacion/casos-de-uso/importar-cuidador.js';
import {
  ErrorDeArchivo,
  importarCuidadores,
} from './comando-importar-cuidadores.js';
import { ejecutarComando } from './ejecutar-comando.js';

// Comando: npm run cuidadores:importar -- ruta/al/archivo.json  (formato en comando-importar-cuidadores.ts).
// Es como entran los cuidadores REALES: con sus tres controles ya revisados por el equipo.
const ruta = process.argv[2];
if (ruta === undefined || ruta.trim() === '') {
  console.error(
    'Falta el archivo. Ejemplo: npm run cuidadores:importar -- ./cuidadores.json',
  );
  process.exit(1);
}
try {
  const resultado = await ejecutarComando((aplicacion) =>
    importarCuidadores(
      ruta,
      aplicacion.get(ImportarCuidador, { strict: false }),
      aplicacion.get<ConsultaDeIdentidad>(CONSULTA_DE_IDENTIDAD, {
        strict: false,
      }),
    ),
  );
  for (const mensaje of resultado.mensajes) console.log(mensaje);
  if (resultado.fallaron > 0) {
    console.error(`${resultado.fallaron} cuidador(es) no se importaron.`);
    process.exit(1);
  }
} catch (error) {
  const esperado =
    error instanceof ErrorDeArchivo || error instanceof ErrorDeDominio;
  console.error(
    esperado
      ? `No se importó nada: ${error.message}`
      : `Falló la importación: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
