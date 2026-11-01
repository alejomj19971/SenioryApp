import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";

const leerDelBackend = vi.fn();
const escribirEnBackend = vi.fn();
vi.mock("@/lib/api/cliente-servidor", () => ({ leerDelBackend, escribirEnBackend }));

const servicioDePagos = await import("@/lib/services/pagos");

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const pagoDelBackend = (extra: object = {}) => ({
  id: UUID,
  concepto: "Servicio de cuidado",
  servicioId: "s1",
  paqueteCodigo: null,
  medio: "pasarela",
  montoTotal: 43_200,
  estado: "pendiente",
  venceEn: "2026-11-01T22:00:00.000Z",
  creadoEn: "2026-11-01T20:00:00.000Z",
  ...extra,
});

beforeEach(() => {
  leerDelBackend.mockReset();
  escribirEnBackend.mockReset();
});

describe("servicios de pagos: lo que llega a la pantalla", () => {
  it("el pago de la familia es una lista blanca: nada del pago al cuidador ni de la pasarela, aunque el backend lo mandara", async () => {
    leerDelBackend.mockResolvedValue({
      pagos: [pagoDelBackend({ pagoProfesional: 36_000, ingresoPlataforma: 7_200, referenciaProveedor: "sim_x", comisionBps: 800 })],
    });

    const pagos = await servicioDePagos.listarPagos();

    expect(Object.keys(pagos[0] as object).sort()).toEqual(["concepto", "creadoEn", "estado", "id", "medio", "montoTotal", "paqueteCodigo", "servicioId", "venceEn"]);
    expect(JSON.stringify(pagos)).not.toMatch(/36000|7200|sim_x|comision/);
  });

  it("el pago de un servicio se busca entre los de la familia; null si todavía no nació", async () => {
    leerDelBackend.mockResolvedValue({ pagos: [pagoDelBackend({ servicioId: "otro" }), pagoDelBackend({ id: "p2", servicioId: "s1" })] });

    expect((await servicioDePagos.obtenerPagoDelServicio("s1"))?.id).toBe("p2");
    expect(await servicioDePagos.obtenerPagoDelServicio("no-hay")).toBeNull();
  });

  it("el enlace de pago trae la dirección y el vencimiento", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { urlDePago: "https://pasarela.example/pagar/1", venceEn: "2026-11-01T22:00:00.000Z" } });

    expect(await servicioDePagos.obtenerEnlaceDePago(UUID)).toEqual({ ok: true, datos: { url: "https://pasarela.example/pagar/1", venceEn: "2026-11-01T22:00:00.000Z" } });
    expect(escribirEnBackend).toHaveBeenCalledWith(`/pagos/${UUID}/enlace`, { metodo: "POST" });
  });

  it("la página pública NO se rompe si el backend no responde: devuelve null", async () => {
    leerDelBackend.mockRejectedValue(ErrorDeApi.deRed(new TypeError("fetch failed")));

    expect(await servicioDePagos.listarPaquetesParaLaPaginaPublica()).toBeNull();
  });

  it("el catálogo vacío es vacío (no se inventan paquetes)", async () => {
    leerDelBackend.mockResolvedValue({ paquetes: [] });

    expect(await servicioDePagos.listarPaquetesParaLaPaginaPublica()).toEqual([]);
  });

  it("comprar manda solo el código del paquete y la clave de idempotencia, nunca un monto", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { pago: pagoDelBackend({ servicioId: null, paqueteCodigo: "prueba-10h" }), urlDePago: "https://pasarela.example/p" } });

    const resultado = await servicioDePagos.comprarPaquete("prueba-10h", "clave-1234");

    expect(escribirEnBackend).toHaveBeenCalledWith("/bolsa/compras", { metodo: "POST", claveDeIdempotencia: "clave-1234", cuerpo: { paquete: "prueba-10h" } });
    expect(resultado).toMatchObject({ ok: true, datos: { url: "https://pasarela.example/p", pago: { paqueteCodigo: "prueba-10h" } } });
  });

  it("las liquidaciones traen solo lo que recibe el cuidador", async () => {
    leerDelBackend.mockResolvedValue({
      liquidaciones: [{ id: "l1", servicioId: "s1", monto: 36_000, estado: "pendiente", pagadaEn: null, creadaEn: "2026-11-01T20:00:00.000Z", totalFamilia: 43_200 }],
    });

    const liquidaciones = await servicioDePagos.listarLiquidaciones();

    expect(liquidaciones).toEqual([{ id: "l1", servicioId: "s1", monto: 36_000, estado: "pendiente", pagadaEn: null, creadaEn: "2026-11-01T20:00:00.000Z" }]);
    expect(JSON.stringify(liquidaciones)).not.toContain("43200");
  });

  it("la bolsa mapea el saldo y los movimientos", async () => {
    leerDelBackend.mockResolvedValue({
      bolsa: { saldoDisponible: 100, saldoReservado: 50, movimientos: [{ id: "m1", tipo: "compra", deltaDisponible: 150, servicioId: null, creadoEn: "2026-11-01T20:00:00.000Z" }] },
    });

    expect(await servicioDePagos.obtenerBolsa()).toEqual({
      saldoDisponible: 100,
      saldoReservado: 50,
      movimientos: [{ id: "m1", tipo: "compra", cambio: 150, servicioId: null, fecha: "2026-11-01T20:00:00.000Z" }],
    });
  });
});

// ── Las acciones ──────────────────────────────────────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const acciones = await import("@/lib/acciones/pagos");

describe("acciones de pagos", () => {
  it("«pagar»: valida el id, y solo manda a una dirección web (nunca javascript: ni otra cosa)", async () => {
    expect((await acciones.pedirEnlaceDePagoAccion("no-uuid")).ok).toBe(false);
    expect(escribirEnBackend).not.toHaveBeenCalled();

    escribirEnBackend.mockResolvedValue({ ok: true, datos: { urlDePago: "javascript:alert(1)", venceEn: "x" } });
    expect(await acciones.pedirEnlaceDePagoAccion(UUID)).toEqual({ ok: false, mensaje: expect.stringContaining("No pudimos abrir el pago") });

    escribirEnBackend.mockResolvedValue({ ok: true, datos: { urlDePago: "https://pasarela.example/p", venceEn: "x" } });
    expect(await acciones.pedirEnlaceDePagoAccion(UUID)).toEqual({ ok: true, url: "https://pasarela.example/p" });
  });

  it("«pagar» sin pasarela (503) lo dice sin fingir", async () => {
    escribirEnBackend.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 503, codigo: "pagos.no_disponible", mensaje: "no" }) });

    expect(await acciones.pedirEnlaceDePagoAccion(UUID)).toEqual({ ok: false, mensaje: expect.stringContaining("no está disponible por ahora") });
  });

  it.each(["", "Paquete Con Mayúsculas", "con espacios", "../../x", "x".repeat(51), 5, null])("comprar rechaza el código %j", async (codigo) => {
    expect((await acciones.comprarBolsaAccion(codigo, "clave-1234")).ok).toBe(false);
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "corta", "x".repeat(101)])("comprar exige una clave razonable (%j)", async (clave) => {
    expect((await acciones.comprarBolsaAccion("prueba-10h", clave)).ok).toBe(false);
  });

  it("comprar con éxito devuelve la dirección de pago; sin dirección, no finge", async () => {
    escribirEnBackend.mockResolvedValueOnce({ ok: true, datos: { pago: pagoDelBackend(), urlDePago: "https://pasarela.example/p" } });
    expect(await acciones.comprarBolsaAccion("prueba-10h", "clave-1234")).toEqual({ ok: true, url: "https://pasarela.example/p" });

    escribirEnBackend.mockResolvedValueOnce({ ok: true, datos: { pago: pagoDelBackend(), urlDePago: null } });
    expect((await acciones.comprarBolsaAccion("prueba-10h", "clave-1234")).ok).toBe(false);
  });

  it("un paquete que ya no se vende se explica con el texto del backend", async () => {
    escribirEnBackend.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 404, codigo: "paquete.no_encontrado", mensaje: "x" }) });

    expect((await acciones.comprarBolsaAccion("prueba-10h", "clave-1234")).ok).toBe(false);
  });
});
