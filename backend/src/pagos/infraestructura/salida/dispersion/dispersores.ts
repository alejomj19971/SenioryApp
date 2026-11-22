import { ServicioNoDisponible } from '../../../../compartido/dominio/errores.js';
import type {
  DispersorDePagos,
  OrdenDeDispersion,
  ResultadoDeDispersion,
} from '../../../aplicacion/puertos/salida/dispersor-de-pagos.js';

// Un dispersor de mentira para desarrollo, pruebas y staging: «paga» al instante sin mover dinero. La
// configuración lo prohíbe en producción.
export class DispersorSimulado implements DispersorDePagos {
  readonly habilitado = true;

  private readonly ordenes = new Map<string, OrdenDeDispersion>();
  // Para pruebas: liquidaciones que este dispersor debe rechazar o fallar.
  private readonly rechazadas = new Set<string>();
  private fallaPasajera = false;

  dispersar(orden: OrdenDeDispersion): Promise<ResultadoDeDispersion> {
    if (this.fallaPasajera) {
      return Promise.reject(new Error('El proveedor no respondió'));
    }
    if (this.rechazadas.has(orden.liquidacionId)) {
      return Promise.resolve({
        estado: 'rechazada',
        motivo: 'cuenta_inexistente',
      });
    }
    // Repetir la orden de la misma liquidación no paga dos veces.
    this.ordenes.set(orden.liquidacionId, orden);
    return Promise.resolve({
      estado: 'pagada',
      referencia: `sim_pago_${orden.liquidacionId}`,
    });
  }

  // Solo para pruebas.
  rechazarLiquidacion(liquidacionId: string): void {
    this.rechazadas.add(liquidacionId);
  }

  fallarPasajeramente(fallar: boolean): void {
    this.fallaPasajera = fallar;
  }

  ordenesRecibidas(): ReadonlyMap<string, OrdenDeDispersion> {
    return this.ordenes;
  }
}

// Un administrador transfiere de verdad por fuera del sistema (Nequi, Daviplata, banco — el que use cada
// cuidador) y lo confirma con `ConfirmarPagoDeLiquidacion`. Este dispersor no mueve dinero: solo marca la
// liquidación como «enviada» para que aparezca en la cola de «por pagar» del administrador.
export class DispersorManual implements DispersorDePagos {
  readonly habilitado = true;

  dispersar(orden: OrdenDeDispersion): Promise<ResultadoDeDispersion> {
    return Promise.resolve({
      estado: 'enviada',
      referencia: `manual:${orden.liquidacionId}`,
    });
  }
}

// Lo que hay mientras no se elija cómo pagarle al cuidador: no se intenta nada y las liquidaciones quedan
// pendientes, a la vista, hasta que haya un dispersor real.
export class DispersorDeshabilitado implements DispersorDePagos {
  readonly habilitado = false;

  dispersar(): Promise<ResultadoDeDispersion> {
    return Promise.reject(
      new ServicioNoDisponible(
        'Los pagos a los cuidadores no están disponibles por ahora',
        'pagos.dispersor_no_disponible',
      ),
    );
  }
}
