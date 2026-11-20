import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cotizacion, Cuidador } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const cotizarServicio = vi.fn();
const solicitarServicioAccion = vi.fn();
vi.mock("@/lib/acciones/servicios", () => ({ cotizarServicio, solicitarServicioAccion }));

const { CarritoDeContratacion } = await import("@/components/contratacion/carrito-de-contratacion");

const AHORA = { hoy: "2026-11-01", minutos: 9 * 60 };

function cuidador(id: string, nombre: string, tarifaHora = 20_000): Cuidador {
  return {
    id,
    nombre,
    foto: "",
    especialidad: "enfermeria",
    titulo: "Enfermera",
    aniosExperiencia: 8,
    tarifaHora,
    zona: "Laureles",
    disponibilidad: ["manana", "tarde", "noche"],
    calificacion: null,
    cantidadResenas: 0,
    serviciosCompletados: 0,
    bio: "",
    verificacion: { antecedentes: true, titulos: true, psicotecnica: true },
    distanciaKm: null,
    resenas: [],
  };
}

const MARIA = cuidador("00000000-0000-4000-8000-000000000001", "María González", 20_000);
const CARLOS = cuidador("00000000-0000-4000-8000-000000000002", "Carlos Ruiz", 25_000);

function cotizacion(cuidadorId: string, tarifaHora: number, horas = 1): Cotizacion {
  return {
    cuidadorId,
    horas,
    tarifaHora,
    subtotal: tarifaHora * horas,
    cargoPorcentaje: 8,
    cargo: Math.round(tarifaHora * horas * 0.08),
    totalFamilia: Math.round(tarifaHora * horas * 1.08),
  };
}

function mostrar(extra: Partial<React.ComponentProps<typeof CarritoDeContratacion>> = {}) {
  return render(
    <CarritoDeContratacion
      cuidadores={[MARIA, CARLOS]}
      ahora={AHORA}
      cotizacionesIniciales={
        new Map([
          [MARIA.id, cotizacion(MARIA.id, 20_000)],
          [CARLOS.id, cotizacion(CARLOS.id, 25_000)],
        ])
      }
      saldoDeLaBolsa={0}
      {...extra}
    />,
  );
}

beforeEach(() => {
  push.mockClear();
  cotizarServicio.mockReset();
  solicitarServicioAccion.mockReset();
});

describe("CarritoDeContratacion", () => {
  it("muestra una tarjeta por cada cuidador, con su propia cotización, y el total combinado", () => {
    mostrar();

    expect(screen.getByText("María González")).toBeInTheDocument();
    expect(screen.getByText("Carlos Ruiz")).toBeInTheDocument();
    // 20.000*1.08 + 25.000*1.08 = 21.600 + 27.000 = 48.600
    expect(screen.getByText(/48\.600/)).toBeInTheDocument();
  });

  it("«Quitar» saca a ese cuidador de la lista y del total", async () => {
    mostrar();

    const tarjetaDeCarlos = screen.getByRole("region", { name: "Carlos Ruiz" });
    await userEvent.click(within(tarjetaDeCarlos).getByRole("button", { name: "Quitar" }));

    expect(screen.queryByText("Carlos Ruiz")).not.toBeInTheDocument();
    expect(screen.getByText("María González")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Total de los 1 servicio").nextSibling).toHaveTextContent("21.600"));
  });

  it("la bolsa solo se ofrece si alcanza para el total COMBINADO, no para uno solo", () => {
    mostrar({ saldoDeLaBolsa: 25_000 }); // alcanza para Carlos solo, no para los dos juntos (48.600)

    expect(screen.getByText(/no alcanza para el total/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Pagar todo con mi bolsa/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("con saldo suficiente, se puede pagar todo con la bolsa", async () => {
    solicitarServicioAccion.mockResolvedValue({ ok: true, servicioId: "s-1" });
    mostrar({ saldoDeLaBolsa: 100_000 });

    await userEvent.click(screen.getByRole("switch", { name: /Pagar todo con mi bolsa/ }));
    await userEvent.click(screen.getByRole("button", { name: /Enviar las 2 solicitudes/ }));

    await waitFor(() => expect(solicitarServicioAccion).toHaveBeenCalledTimes(2));
    for (const llamada of solicitarServicioAccion.mock.calls) {
      expect((llamada[0] as Record<string, unknown>).medioDePago).toBe("bolsa");
    }
  });

  it("envía una solicitud independiente por cada cuidador, con su propia clave de idempotencia", async () => {
    solicitarServicioAccion.mockResolvedValue({ ok: true, servicioId: "s-1" });
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: /Enviar las 2 solicitudes/ }));

    await waitFor(() => expect(solicitarServicioAccion).toHaveBeenCalledTimes(2));
    const idsEnviados = solicitarServicioAccion.mock.calls.map((llamada) => (llamada[0] as Record<string, unknown>).cuidadorId);
    expect(idsEnviados.sort()).toEqual([MARIA.id, CARLOS.id].sort());
    const claves = solicitarServicioAccion.mock.calls.map((llamada) => llamada[1] as string);
    expect(claves[0]).not.toBe(claves[1]);
  });

  it("si uno falla y el otro no, se puede ver cuál y reintentar solo ese (no se pierde el que sí funcionó)", async () => {
    solicitarServicioAccion.mockImplementation(async (datos: Record<string, unknown>) =>
      datos.cuidadorId === CARLOS.id
        ? { ok: false, mensaje: "Ese cuidador ya tiene un servicio en ese horario." }
        : { ok: true, servicioId: "s-1" },
    );
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: /Enviar las 2 solicitudes/ }));

    expect(await screen.findByText("Solicitud enviada")).toBeInTheDocument();
    expect(await screen.findByText(/ya tiene un servicio en ese horario/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar este" })).toBeInTheDocument();
    // No navega todavía: todavía queda uno fallido.
    expect(push).not.toHaveBeenCalled();
  });

  it("cuando todas se enviaron bien, ofrece ir a mis servicios", async () => {
    solicitarServicioAccion.mockResolvedValue({ ok: true, servicioId: "s-1" });
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: /Enviar las 2 solicitudes/ }));

    const irAServicios = await screen.findByRole("button", { name: "Ir a mis servicios" });
    await userEvent.click(irAServicios);
    expect(push).toHaveBeenCalledWith("/app/servicios");
  });
});
