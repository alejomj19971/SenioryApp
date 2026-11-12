import { ServicioNoDisponible } from '../../../../compartido/dominio/errores.js';
import type {
  AvisoDeLaPasarela,
  CobroCreado,
  EstadoEnLaPasarela,
  PasarelaDePagos,
} from '../../../aplicacion/puertos/salida/pasarela-de-pagos.js';

const CODIGO = 'pagos.pasarela_no_disponible';

function noDisponible(): never {
  throw new ServicioNoDisponible(
    'Los pagos no están disponibles por ahora',
    CODIGO,
  );
}

// Lo que hay mientras no se elija una pasarela real: cobrar responde «no disponible». No se finge un cobro.
export class PasarelaDeshabilitada implements PasarelaDePagos {
  readonly nombre = 'deshabilitada';
  readonly habilitada = false;

  crearCobro(): Promise<CobroCreado> {
    return Promise.reject(
      new ServicioNoDisponible(
        'Los pagos no están disponibles por ahora',
        CODIGO,
      ),
    );
  }

  consultarEstado(): Promise<EstadoEnLaPasarela> {
    return noDisponible();
  }

  reembolsar(): Promise<void> {
    return Promise.reject(
      new ServicioNoDisponible(
        'Los pagos no están disponibles por ahora',
        CODIGO,
      ),
    );
  }

  verificarFirma(): boolean {
    return false;
  }

  interpretarAviso(): Promise<AvisoDeLaPasarela | null> {
    return Promise.resolve(null);
  }
}
