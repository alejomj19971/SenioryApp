import "server-only";
import { leerDelBackend } from "@/lib/api/cliente-servidor";
import type { RespuestaDeBolsa } from "@/lib/api/contratos/pagos";
import type { Bolsa } from "@/lib/types";

// Pagos (M7) sobre la API. Dinero siempre en pesos enteros; la bolsa nunca queda negativa (lo garantiza la base).

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
