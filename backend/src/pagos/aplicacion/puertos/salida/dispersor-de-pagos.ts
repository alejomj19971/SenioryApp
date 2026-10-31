export interface OrdenDeDispersion {
  // Hace que repetir la orden no pague dos veces al cuidador.
  liquidacionId: string;
  cuidadorId: string;
  // Pesos enteros.
  monto: number;
}

export type ResultadoDeDispersion =
  // El dinero ya está en la cuenta del cuidador.
  | { estado: 'pagada'; referencia: string }
  // El proveedor recibió la orden y la está procesando.
  | { estado: 'enviada'; referencia: string }
  // Rechazo definitivo (cuenta inexistente, por ejemplo). Un error pasajero NO es esto: se lanza y se reintenta.
  | { estado: 'rechazada'; motivo: string };

// Quien le paga al cuidador lo que se le debe. Cómo se le paga (transferencia, dispersión de la pasarela) es una
// decisión abierta: cada opción es un adaptador de este puerto. Mientras no haya uno, el deshabilitado deja las
// liquidaciones pendientes: no se finge un pago que no ocurrió.
export interface DispersorDePagos {
  readonly habilitado: boolean;

  dispersar(orden: OrdenDeDispersion): Promise<ResultadoDeDispersion>;
}

export const DISPERSOR_DE_PAGOS = Symbol('DispersorDePagos');
