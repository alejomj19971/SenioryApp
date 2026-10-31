import type { Bolsa, MovimientoDeBolsa } from '../dominio/bolsa.js';
import type { Liquidacion } from '../dominio/liquidacion.js';
import type { PaqueteDeBolsa } from '../dominio/paquete-de-bolsa.js';
import type { Pago } from '../dominio/pago.js';
import type { CotizacionDeServicio } from './puertos/entrada/cotizador-de-servicios.js';

// Lo que ve la familia al cotizar. Es una lista blanca: el pago al profesional, el ingreso de la plataforma y
// la comisión del profesional NO están aquí. Una prueba de instantánea vigila que no crezca sin que se note.
export interface VistaDeCotizacion {
  cuidadorId: string;
  horas: number;
  tarifaHora: number;
  subtotal: number;
  cargoDeServicio: {
    // En porcentaje legible (8 para 800 puntos básicos; 7,5 para 750).
    porcentaje: number;
    monto: number;
  };
  totalFamilia: number;
  // Se envía de vuelta al contratar para que el servidor sepa con qué comisiones se mostró el precio.
  politicaVersion: number;
}

export function vistaDeCotizacion(
  cotizacion: CotizacionDeServicio,
): VistaDeCotizacion {
  return {
    cuidadorId: cotizacion.cuidadorId,
    horas: cotizacion.horas,
    tarifaHora: cotizacion.tarifaHora,
    subtotal: cotizacion.subtotal,
    cargoDeServicio: {
      porcentaje: cotizacion.comisionFamiliaBps / 100,
      monto: cotizacion.cargoFamilia,
    },
    totalFamilia: cotizacion.totalFamilia,
    politicaVersion: cotizacion.politicaVersion,
  };
}

// Lo que ve la familia de un pago. Lista blanca: ni el pago al cuidador ni el ingreso de la plataforma ni la
// referencia de la pasarela salen de aquí.
export interface VistaDePaquete {
  codigo: string;
  horasReferencia: number;
  descuento: number;
  credito: number;
  precio: number;
}

export function vistaDePaquete(paquete: PaqueteDeBolsa): VistaDePaquete {
  return {
    codigo: paquete.codigo,
    horasReferencia: paquete.horasReferencia,
    // En porcentaje legible (10 para 1000 puntos básicos).
    descuento: paquete.descuentoBps / 100,
    credito: paquete.credito,
    precio: paquete.precio,
  };
}

export interface VistaDePago {
  id: string;
  concepto: string;
  servicioId: string | null;
  paqueteCodigo: string | null;
  medio: string;
  montoTotal: number;
  estado: string;
  // Hasta cuándo puede pagarse; solo mientras está pendiente.
  venceEn: string | null;
  creadoEn: string;
}

export function vistaDePago(pago: Pago, minutosParaPagar: number): VistaDePago {
  return {
    id: pago.id,
    concepto: pago.concepto,
    servicioId: pago.servicioId,
    paqueteCodigo: pago.paqueteCodigo,
    medio: pago.medio,
    montoTotal: pago.montoTotal,
    estado: pago.estado,
    venceEn: pago.estaPendiente()
      ? pago.venceEn(minutosParaPagar).toISOString()
      : null,
    creadoEn: pago.creadoEn.toISOString(),
  };
}

export interface VistaDeMovimiento {
  id: string;
  tipo: string;
  deltaDisponible: number;
  servicioId: string | null;
  creadoEn: string;
}

export interface VistaDeBolsa {
  saldoDisponible: number;
  saldoReservado: number;
  movimientos: VistaDeMovimiento[];
}

export function vistaDeBolsa(
  bolsa: Bolsa,
  movimientos: readonly MovimientoDeBolsa[],
): VistaDeBolsa {
  return {
    saldoDisponible: bolsa.saldoDisponible,
    saldoReservado: bolsa.saldoReservado,
    movimientos: movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      deltaDisponible: m.deltaDisponible,
      servicioId: m.servicioId,
      creadoEn: m.creadoEn.toISOString(),
    })),
  };
}

// Lo que ve el cuidador de lo que se le debe.
export interface VistaDeLiquidacion {
  id: string;
  servicioId: string;
  monto: number;
  estado: string;
  pagadaEn: string | null;
  creadaEn: string;
}

export function vistaDeLiquidacion(
  liquidacion: Liquidacion,
): VistaDeLiquidacion {
  return {
    id: liquidacion.id,
    servicioId: liquidacion.servicioId,
    monto: liquidacion.monto,
    estado: liquidacion.estado,
    pagadaEn: liquidacion.pagadaEn?.toISOString() ?? null,
    creadaEn: liquidacion.creadaEn.toISOString(),
  };
}
