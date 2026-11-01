// Lo que el backend RESPONDE en Pagos (M7). Contrato de lo que el frontend lee; lo vigilan las pruebas de contrato.
// La familia ve subtotal, cargo, total, estado y vencimiento; NUNCA el pago al cuidador, el ingreso de la plataforma
// ni la referencia de la pasarela.

export interface MovimientoDeBolsaDelBackend {
  id: string;
  tipo: string;
  // Positivo si entra saldo, negativo si sale.
  deltaDisponible: number;
  servicioId: string | null;
  creadoEn: string;
}

// `GET /bolsa`
export interface RespuestaDeBolsa {
  bolsa: {
    // Pesos que se pueden gastar ya.
    saldoDisponible: number;
    // Pesos apartados para servicios confirmados que aún no terminan.
    saldoReservado: number;
    movimientos: MovimientoDeBolsaDelBackend[];
  };
}

export type EstadoDePagoDelBackend = "pendiente" | "aprobado" | "rechazado" | "expirado" | "reembolsado";

// Un pago visto por la familia. Lista blanca: ni el pago al cuidador, ni el ingreso de la plataforma, ni la referencia
// de la pasarela salen del backend.
export interface PagoDelBackend {
  id: string;
  concepto: string;
  servicioId: string | null;
  paqueteCodigo: string | null;
  medio: string;
  montoTotal: number;
  estado: EstadoDePagoDelBackend;
  // Hasta cuándo puede pagarse; solo mientras está pendiente.
  venceEn: string | null;
  creadoEn: string;
}

// `GET /pagos`
export interface RespuestaDePagos {
  pagos: PagoDelBackend[];
}

// `POST /pagos/:id/enlace`
export interface RespuestaDeEnlaceDePago {
  urlDePago: string;
  venceEn: string;
}

// `GET /catalogo/bolsas` (pública): vacía hasta que el negocio apruebe precios.
export interface PaqueteDelBackend {
  codigo: string;
  horasReferencia: number;
  // Porcentaje legible (10 para 1000 puntos básicos).
  descuento: number;
  // Lo que recibe la bolsa (puede ser mayor que el precio).
  credito: number;
  // Lo que paga la familia.
  precio: number;
}
export interface RespuestaDeCatalogo {
  paquetes: PaqueteDelBackend[];
}

// `POST /bolsa/compras`
export interface RespuestaDeCompraDeBolsa {
  pago: PagoDelBackend;
  urlDePago: string | null;
}

// `GET /liquidaciones` (cuidador)
export interface LiquidacionDelBackend {
  id: string;
  servicioId: string;
  monto: number;
  estado: "pendiente" | "enviada" | "pagada" | "fallida";
  pagadaEn: string | null;
  creadaEn: string;
}
export interface RespuestaDeLiquidaciones {
  liquidaciones: LiquidacionDelBackend[];
}
