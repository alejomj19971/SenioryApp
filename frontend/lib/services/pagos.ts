import "server-only";
import { escribirEnBackend, leerDelBackend, type ResultadoDeEscritura } from "@/lib/api/cliente-servidor";
import type {
  PagoDelBackend,
  PaqueteDelBackend,
  RespuestaDeBolsa,
  RespuestaDeCatalogo,
  RespuestaDeCompraDeBolsa,
  RespuestaDeEnlaceDePago,
  RespuestaDeLiquidaciones,
  RespuestaDePagos,
} from "@/lib/api/contratos/pagos";
import type { Bolsa, Liquidacion, Pago, PaqueteDeBolsa } from "@/lib/types";

// Pagos (M7) sobre la API. Dinero siempre en pesos enteros; la bolsa nunca queda negativa (lo garantiza la base).
// La familia ve subtotal, cargo, total y estado de su pago; el backend nunca le entrega lo que recibe el cuidador.

function aPago(pago: PagoDelBackend): Pago {
  return {
    id: pago.id,
    concepto: pago.concepto,
    servicioId: pago.servicioId,
    paqueteCodigo: pago.paqueteCodigo,
    medio: pago.medio,
    montoTotal: pago.montoTotal,
    estado: pago.estado,
    venceEn: pago.venceEn,
    creadoEn: pago.creadoEn,
  };
}

function aPaquete(paquete: PaqueteDelBackend): PaqueteDeBolsa {
  return {
    codigo: paquete.codigo,
    horasReferencia: paquete.horasReferencia,
    descuento: paquete.descuento,
    credito: paquete.credito,
    precio: paquete.precio,
  };
}

export async function obtenerBolsa(): Promise<Bolsa> {
  const { bolsa } = await leerDelBackend<RespuestaDeBolsa>("/bolsa");
  return {
    saldoDisponible: bolsa.saldoDisponible,
    saldoReservado: bolsa.saldoReservado,
    movimientos: bolsa.movimientos.map((movimiento) => ({
      id: movimiento.id,
      tipo: movimiento.tipo,
      cambio: movimiento.deltaDisponible,
      servicioId: movimiento.servicioId,
      fecha: movimiento.creadoEn,
    })),
  };
}

// Los pagos de la familia, del más reciente al más antiguo.
export async function listarPagos(): Promise<Pago[]> {
  const { pagos } = await leerDelBackend<RespuestaDePagos>("/pagos");
  return pagos.map(aPago);
}

// El pago de un servicio, o null si todavía no nació (el cobro se crea unos instantes después de que el cuidador acepta).
export async function obtenerPagoDelServicio(servicioId: string): Promise<Pago | null> {
  return (await listarPagos()).find((pago) => pago.servicioId === servicioId) ?? null;
}

// La dirección de la pasarela a la que se manda a pagar. Pedirla dos veces devuelve el mismo cobro.
export async function obtenerEnlaceDePago(pagoId: string): Promise<ResultadoDeEscritura<{ url: string; venceEn: string }>> {
  const resultado = await escribirEnBackend<RespuestaDeEnlaceDePago>(`/pagos/${pagoId}/enlace`, { metodo: "POST" });
  return resultado.ok ? { ok: true, datos: { url: resultado.datos.urlDePago, venceEn: resultado.datos.venceEn } } : resultado;
}

// Los paquetes a la venta. El catálogo viene VACÍO hasta que el negocio apruebe precios: nunca se inventan.
export async function listarPaquetes(): Promise<PaqueteDeBolsa[]> {
  const { paquetes } = await leerDelBackend<RespuestaDeCatalogo>("/catalogo/bolsas");
  return paquetes.map(aPaquete);
}

// Para la página pública: si el backend no responde, la página NO se rompe; solo no muestra los precios.
export async function listarPaquetesParaLaPaginaPublica(): Promise<PaqueteDeBolsa[] | null> {
  try {
    return await listarPaquetes();
  } catch {
    return null;
  }
}

// Compra un paquete: queda un pago pendiente y la bolsa se acredita SOLO cuando la pasarela confirma. `clave` es la
// Idempotency-Key: reintentar la misma compra no la repite.
export async function comprarPaquete(
  codigo: string,
  clave: string,
): Promise<ResultadoDeEscritura<{ pago: Pago; url: string | null }>> {
  const resultado = await escribirEnBackend<RespuestaDeCompraDeBolsa>("/bolsa/compras", {
    metodo: "POST",
    claveDeIdempotencia: clave,
    cuerpo: { paquete: codigo },
  });
  return resultado.ok ? { ok: true, datos: { pago: aPago(resultado.datos.pago), url: resultado.datos.urlDePago } } : resultado;
}

// Lo que se le debe y lo que ya se le pagó al cuidador, del más reciente al más antiguo.
export async function listarLiquidaciones(): Promise<Liquidacion[]> {
  const { liquidaciones } = await leerDelBackend<RespuestaDeLiquidaciones>("/liquidaciones");
  return liquidaciones.map((liquidacion) => ({
    id: liquidacion.id,
    servicioId: liquidacion.servicioId,
    monto: liquidacion.monto,
    estado: liquidacion.estado,
    pagadaEn: liquidacion.pagadaEn,
    creadaEn: liquidacion.creadaEn,
  }));
}
