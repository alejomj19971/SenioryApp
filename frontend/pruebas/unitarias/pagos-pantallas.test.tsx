import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pago, PaqueteDeBolsa, Servicio } from "@/lib/types";

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";

const pedirEnlaceDePagoAccion = vi.fn();
const comprarBolsaAccion = vi.fn();
vi.mock("@/lib/acciones/pagos", () => ({ pedirEnlaceDePagoAccion, comprarBolsaAccion }));

const { SeccionDePago } = await import("@/components/pagos/seccion-de-pago");
const { TarjetaDePaquete } = await import("@/components/pagos/tarjeta-de-paquete");

const servicio = (extra: Partial<Servicio> = {}): Servicio => ({
  id: "s1",
  estado: "aceptado",
  fecha: "2026-11-10",
  jornada: "tarde",
  horas: 2,
  medioDePago: "pasarela",
  solicitudExpiraEn: null,
  cuidador: { id: "c1", nombre: "Marta" },
  adultoMayor: null,
  solicitadoEn: "2026-11-01T20:00:00.000Z",
  aceptadoEn: null,
  iniciadoEn: null,
  finalizadoEn: null,
  canceladoEn: null,
  motivoDeCancelacion: null,
  calificacion: null,
  tarifaHora: 20_000,
  subtotal: 40_000,
  cargoDeServicio: 3_200,
  totalFamilia: 43_200,
  ...extra,
});
const pago = (extra: Partial<Pago> = {}): Pago => ({
  id: UUID, concepto: "Servicio", servicioId: "s1", paqueteCodigo: null, medio: "pasarela", montoTotal: 43_200, estado: "pendiente",
  venceEn: "2026-11-02T01:00:00.000Z", creadoEn: "2026-11-01T20:00:00.000Z", ...extra,
});

describe("SeccionDePago (qué ve la familia de su pago)", () => {
  it("mientras nadie aceptó no hay nada que pagar", () => {
    const { container } = render(<SeccionDePago servicio={servicio({ estado: "solicitado" })} pago={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("aceptado pero sin pago todavía: «estamos preparando tu pago» con forma de actualizar", () => {
    render(<SeccionDePago servicio={servicio()} pago={null} />);

    expect(screen.getByText("Estamos preparando tu pago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Actualizar" })).toHaveAttribute("href", "/app/servicios/s1");
  });

  it("pendiente: dice cuánto y hasta qué hora (de Colombia), y ofrece pagar", () => {
    render(<SeccionDePago servicio={servicio()} pago={pago()} />);

    expect(screen.getByText(/Falta pagar/)).toHaveTextContent("43.200");
    expect(screen.getByText("20:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar ahora" })).toBeInTheDocument();
  });

  it("aprobado con pasarela y con bolsa se dicen distinto, y no ofrecen pagar", () => {
    const { rerender } = render(<SeccionDePago servicio={servicio()} pago={pago({ estado: "aprobado" })} />);
    expect(screen.getByText(/Pago recibido/)).toBeInTheDocument();
    expect(screen.getByText(/Pagaste/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar ahora" })).not.toBeInTheDocument();

    rerender(<SeccionDePago servicio={servicio({ medioDePago: "bolsa" })} pago={pago({ estado: "aprobado", medio: "bolsa" })} />);
    expect(screen.getByText(/Se descontó de tu bolsa/)).toBeInTheDocument();
  });

  it("reembolsado: dice que se devolvió y a dónde", () => {
    render(<SeccionDePago servicio={servicio({ estado: "cancelado" })} pago={pago({ estado: "reembolsado" })} />);

    expect(screen.getByText("Te devolvimos el dinero.")).toBeInTheDocument();
  });

  it.each([
    ["rechazado", "El pago no se completó"],
    ["expirado", "El pago venció"],
  ] as const)("%s: se explica y aclara que no se cobró nada", (estado, titulo) => {
    render(<SeccionDePago servicio={servicio({ estado: "cancelado" })} pago={pago({ estado })} />);

    expect(screen.getByRole("alert")).toHaveTextContent(titulo);
    expect(screen.getByRole("alert")).toHaveTextContent("No se te cobró nada");
  });

  it("un servicio cancelado que nunca tuvo pago no muestra nada", () => {
    const { container } = render(<SeccionDePago servicio={servicio({ estado: "cancelado" })} pago={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("BotonPagar", () => {
  beforeEach(() => pedirEnlaceDePagoAccion.mockReset());

  it("si no se puede abrir el pago, lo dice y no navega", async () => {
    pedirEnlaceDePagoAccion.mockResolvedValue({ ok: false, mensaje: "Esto no está disponible por ahora." });
    render(<SeccionDePago servicio={servicio()} pago={pago()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pagar ahora" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esto no está disponible por ahora.");
    expect(pedirEnlaceDePagoAccion).toHaveBeenCalledWith(UUID);
  });
});

describe("TarjetaDePaquete", () => {
  const paquete: PaqueteDeBolsa = { codigo: "prueba-10h", horasReferencia: 10, descuento: 10, credito: 216_000, precio: 194_400 };
  beforeEach(() => comprarBolsaAccion.mockReset());

  it("muestra lo que se paga y lo que se recibe, del servidor", () => {
    render(<TarjetaDePaquete paquete={paquete} />);

    expect(screen.getByText("10 horas")).toBeInTheDocument();
    expect(screen.getByText("10 % menos")).toBeInTheDocument();
    expect(screen.getByText(/194\.400/)).toBeInTheDocument();
    expect(screen.getByText(/216\.000/)).toBeInTheDocument();
  });

  it("reintentar la compra usa la misma clave de idempotencia", async () => {
    comprarBolsaAccion.mockResolvedValue({ ok: false, mensaje: "Sin conexión." });
    render(<TarjetaDePaquete paquete={paquete} />);
    const comprar = () => userEvent.click(screen.getByRole("button", { name: "Comprar este paquete" }));

    await comprar();
    await screen.findByText("No pudimos iniciar la compra");
    await comprar();

    await waitFor(() => expect(comprarBolsaAccion).toHaveBeenCalledTimes(2));
    expect(comprarBolsaAccion.mock.calls[0]).toEqual(["prueba-10h", comprarBolsaAccion.mock.calls[1]?.[1]]);
    expect(comprarBolsaAccion.mock.calls[0]?.[1]).toHaveLength(36);
  });
});
