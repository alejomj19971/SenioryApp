import {
  Bolsa,
  type MovimientoDeBolsa,
  type TipoDeMovimiento,
} from '../../../dominio/bolsa.js';
import type {
  BolsaId,
  LiquidacionId,
  MovimientoDeBolsaId,
  PagoId,
} from '../../../dominio/ids.js';
import {
  Liquidacion,
  type EstadoDeLiquidacion,
} from '../../../dominio/liquidacion.js';
import type { PaqueteDeBolsa } from '../../../dominio/paquete-de-bolsa.js';
import {
  Pago,
  type ConceptoDePago,
  type EstadoDePago,
  type MedioDelPago,
} from '../../../dominio/pago.js';
import type {
  bolsas,
  liquidaciones,
  movimientosDeBolsa,
  paquetesDeBolsa,
  pagos,
} from './pagos.esquema.js';

// Las columnas de texto de la base se acotan con CHECK, así que los valores que salen son los del dominio.
export function pagoDeFila(fila: typeof pagos.$inferSelect): Pago {
  return Pago.reconstruir({
    id: fila.id as PagoId,
    concepto: fila.concepto as ConceptoDePago,
    servicioId: fila.servicioId,
    paqueteCodigo: fila.paqueteCodigo,
    pagadorId: fila.pagadorId,
    medio: fila.medio as MedioDelPago,
    montoTotal: fila.montoTotal,
    pagoProfesional: fila.pagoProfesional,
    ingresoPlataforma: fila.ingresoPlataforma,
    politicaVersion: fila.politicaVersion,
    estado: fila.estado as EstadoDePago,
    proveedor: fila.proveedor,
    referenciaProveedor: fila.referenciaProveedor,
    claveDeIdempotencia: fila.claveIdempotencia,
    aprobadoEn: fila.aprobadoEn,
    version: fila.version,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  });
}

export function bolsaDeFila(fila: typeof bolsas.$inferSelect): Bolsa {
  return Bolsa.reconstruir({
    id: fila.id as BolsaId,
    familiarId: fila.familiarId,
    saldoDisponible: fila.saldoDisponible,
    saldoReservado: fila.saldoReservado,
    version: fila.version,
    creadaEn: fila.creadaEn,
    actualizadaEn: fila.actualizadaEn,
  });
}

export function movimientoDeFila(
  fila: typeof movimientosDeBolsa.$inferSelect,
): MovimientoDeBolsa {
  return {
    id: fila.id as MovimientoDeBolsaId,
    bolsaId: fila.bolsaId as BolsaId,
    tipo: fila.tipo as TipoDeMovimiento,
    deltaDisponible: fila.deltaDisponible,
    deltaReservado: fila.deltaReservado,
    servicioId: fila.servicioId,
    pagoId: fila.pagoId,
    creadoEn: fila.creadoEn,
  };
}

export function liquidacionDeFila(
  fila: typeof liquidaciones.$inferSelect,
): Liquidacion {
  return Liquidacion.reconstruir({
    id: fila.id as LiquidacionId,
    cuidadorId: fila.cuidadorId,
    servicioId: fila.servicioId,
    monto: fila.monto,
    estado: fila.estado as EstadoDeLiquidacion,
    referenciaDispersion: fila.referenciaDispersion,
    creadaEn: fila.creadaEn,
    pagadaEn: fila.pagadaEn,
  });
}

export function paqueteDeFila(
  fila: typeof paquetesDeBolsa.$inferSelect,
): PaqueteDeBolsa {
  return {
    codigo: fila.codigo,
    horasReferencia: fila.horasReferencia,
    descuentoBps: fila.descuentoBps,
    credito: fila.credito,
    precio: fila.precio,
    activo: fila.activo,
  };
}
