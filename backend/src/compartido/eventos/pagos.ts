import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Pagos. Solo IDs y montos en pesos: nunca datos de tarjeta ni de la cuenta
// del cuidador.

// Hay que pagar el servicio: Notificaciones se lo dice a la familia. Se publica al crearse el cobro de un servicio
// que se paga con la pasarela (con bolsa no hace falta: se descuenta solo).
export type PagoRequerido = EventoDeIntegracion<
  'pagos.pago_requerido',
  { pagoId: string; pagadorId: string; servicioId: string }
>;

// El pago quedó aprobado: el dinero está de este lado. Para un servicio, ya puede iniciar.
export type PagoAprobado = EventoDeIntegracion<
  'pagos.pago_aprobado',
  { pagoId: string; pagadorId: string; servicioId: string | null }
>;

// Por qué no se hizo el pago: la pasarela lo rechazó, venció sin pagarse o la bolsa no alcanzaba.
export type MotivoDePagoFallido =
  'rechazado' | 'expirado' | 'saldo_insuficiente';

// El pago no se hizo. Reservas cancela el servicio y Notificaciones avisa a la familia.
export type PagoRechazado = EventoDeIntegracion<
  'pagos.pago_rechazado',
  {
    pagoId: string;
    pagadorId: string;
    servicioId: string | null;
    motivo: MotivoDePagoFallido;
  }
>;

// Se devolvió el dinero (o se liberó el saldo de la bolsa).
export type PagoReembolsado = EventoDeIntegracion<
  'pagos.pago_reembolsado',
  { pagoId: string; pagadorId: string; servicioId: string | null }
>;

// Se acreditó una bolsa.
export type BolsaComprada = EventoDeIntegracion<
  'pagos.bolsa_comprada',
  { bolsaId: string; familiarId: string; pagoId: string }
>;

// Quedó registrado lo que se le debe al cuidador por un servicio.
export type LiquidacionRealizada = EventoDeIntegracion<
  'pagos.liquidacion_realizada',
  { liquidacionId: string; cuidadorId: string; servicioId: string }
>;

export type EventoDePagos =
  | PagoRequerido
  | PagoAprobado
  | PagoRechazado
  | PagoReembolsado
  | BolsaComprada
  | LiquidacionRealizada;
