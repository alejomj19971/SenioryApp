import { RevisarVigencias } from '../../../aplicacion/casos-de-uso/revisar-vigencias.js';
import { ejecutarComando } from './ejecutar-comando.js';

// Comando: npm run cuidadores:revisar-vigencias  (programarlo una vez al día).
// Oculta a los cuidadores a quienes se les venció un control.
try {
  const resultado = await ejecutarComando((aplicacion) =>
    aplicacion.get(RevisarVigencias, { strict: false }).ejecutar(),
  );
  console.log(
    resultado.ocultados === 0
      ? 'Todos los cuidadores visibles tienen sus controles vigentes.'
      : `Cuidadores ocultados por control vencido: ${resultado.ocultados}.`,
  );
} catch (error) {
  console.error(
    `Falló la revisión: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
