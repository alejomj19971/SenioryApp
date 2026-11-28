import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pago } from "@/lib/types";

const refresh = vi.fn();
const redirect = vi.fn((destino: string): never => {
  throw new Error(`REDIRECT:${destino}`);
});
// El router de Next es estable entre renders: el doble también (si no, el efecto se reiniciaría en cada render).
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router, redirect }));

const listarPagos = vi.fn();
vi.mock("@/lib/services/pagos", () => ({ listarPagos }));

const { default: RetornoDelPagoPage } = await import("@/app/app/pagos/retorno/page");
const { EsperandoElPago } = await import("@/components/pagos/esperando-el-pago");
const { AvisoDeEntornoDePrueba } = await import("@/components/shell/aviso-de-entorno-de-prueba");

const pago = (cambios: Partial<Pago> = {}): Pago => ({
  id: "p1",
  concepto: "servicio",
  servicioId: "s1",
  paqueteCodigo: null,
  medio: "pasarela",
  montoTotal: 43_200,
  estado: "pendiente",
  venceEn: null,
  creadoEn: "2030-06-10T15:00:00.000Z",
  ...cambios,
});

const abrir = (consulta: Record<string, string | string[] | undefined>) =>
  RetornoDelPagoPage({ searchParams: Promise.resolve(consulta) } as never);

async function destinoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    if (mensaje.startsWith("REDIRECT:")) return mensaje.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("No redirigió");
}

beforeEach(() => {
  refresh.mockReset();
  redirect.mockClear();
  listarPagos.mockReset();
});

describe("pantalla de retorno del pago", () => {
  it("con el pago ya aprobado, lleva directo al servicio", async () => {
    listarPagos.mockResolvedValue([pago({ estado: "aprobado" })]);

    expect(await destinoDe(abrir({ pago: "p1" }))).toBe("/app/servicios/s1");
  });

  it("un pago de la bolsa (sin servicio) aprobado lleva a «Mi bolsa»", async () => {
    listarPagos.mockResolvedValue([pago({ estado: "aprobado", servicioId: null, paqueteCodigo: "prueba-5h" })]);

    expect(await destinoDe(abrir({ pago: "p1" }))).toBe("/app/bolsa");
  });

  it("un enlace sin pago, o con un pago que no es de esta persona, vuelve al inicio sin explicar nada", async () => {
    listarPagos.mockResolvedValue([pago({ id: "otro" })]);

    expect(await destinoDe(abrir({ pago: "p1" }))).toBe("/app");
    expect(await destinoDe(abrir({}))).toBe("/app");
    expect(await destinoDe(abrir({ pago: ["a", "b"] }))).toBe("/app");
  });

  it("mientras la pasarela no avisa, muestra que estamos verificando (no que está pagado)", async () => {
    listarPagos.mockResolvedValue([pago({ estado: "pendiente" })]);

    render(await abrir({ pago: "p1" }));

    expect(screen.getByText("Estamos verificando tu pago")).toBeInTheDocument();
    expect(screen.queryByText(/Pago recibido/)).not.toBeInTheDocument();
  });

  it("si el pago se rechazó o venció, dice que no se cobró nada y ofrece volver al servicio", async () => {
    listarPagos.mockResolvedValue([pago({ estado: "rechazado" })]);

    render(await abrir({ pago: "p1" }));

    expect(screen.getByText("El pago no se completó")).toBeInTheDocument();
    expect(screen.getByText(/No se te cobró nada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a mi servicio" })).toHaveAttribute("href", "/app/servicios/s1");
  });
});

describe("EsperandoElPago", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("vuelve a preguntarle al servidor cada 2 segundos", () => {
    render(<EsperandoElPago servicioId="s1" />);
    expect(refresh).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(2_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(4_000));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("después de 40 segundos deja de insistir y dice que tarda más de lo normal, sin asustar", () => {
    render(<EsperandoElPago servicioId="s1" />);

    act(() => void vi.advanceTimersByTime(41_000));
    const llamadas = refresh.mock.calls.length;
    act(() => void vi.advanceTimersByTime(20_000));

    expect(screen.getByText("Tu pago está tardando más de lo normal")).toBeInTheDocument();
    expect(screen.getByText(/no se cobra dos veces/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver mi servicio" })).toHaveAttribute("href", "/app/servicios/s1");
    expect(refresh.mock.calls.length).toBe(llamadas);
  });
});

describe("AvisoDeEntornoDePrueba", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con ENTORNO_DE_PRUEBA=true dice que no se cobra dinero real", () => {
    vi.stubEnv("ENTORNO_DE_PRUEBA", "true");

    render(<AvisoDeEntornoDePrueba />);

    expect(screen.getByRole("note")).toHaveTextContent("Entorno de prueba: aquí no se cobra dinero real");
  });

  it("sin la variable (el servicio real), no muestra nada", () => {
    vi.stubEnv("ENTORNO_DE_PRUEBA", "");

    const { container } = render(<AvisoDeEntornoDePrueba />);

    expect(container).toBeEmptyDOMElement();
  });
});
