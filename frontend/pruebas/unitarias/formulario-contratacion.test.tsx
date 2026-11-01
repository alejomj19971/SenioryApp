import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cotizacion, Cuidador } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const cotizarServicio = vi.fn();
const solicitarServicioAccion = vi.fn();
vi.mock("@/lib/acciones/servicios", () => ({ cotizarServicio, solicitarServicioAccion }));

const { FormularioContratacion } = await import("@/components/contratacion/formulario-contratacion");

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const cuidador: Cuidador = {
  id: UUID,
  nombre: "Marta Elena Restrepo",
  foto: "",
  especialidad: "enfermeria",
  titulo: "Enfermera",
  aniosExperiencia: 8,
  tarifaHora: 20_000,
  zona: "Laureles",
  disponibilidad: ["manana", "tarde", "noche"],
  calificacion: null,
  cantidadResenas: 0,
  serviciosCompletados: 0,
  bio: "",
  verificacion: { antecedentes: true, titulos: true, psicotecnica: true },
  resenas: [],
};

const cotizacion = (horas: number): Cotizacion => ({
  cuidadorId: UUID,
  horas,
  tarifaHora: 20_000,
  subtotal: 20_000 * horas,
  cargoPorcentaje: 8,
  cargo: 1_600 * horas,
  totalFamilia: 21_600 * horas,
});

function mostrar(extra: Partial<React.ComponentProps<typeof FormularioContratacion>> = {}) {
  return render(
    <FormularioContratacion
      cuidador={cuidador}
      ahora={{ hoy: "2026-11-01", minutos: 9 * 60 }}
      cotizacionInicial={cotizacion(1)}
      saldoDeLaBolsa={0}
      {...extra}
    />,
  );
}

beforeEach(() => {
  push.mockClear();
  cotizarServicio.mockReset();
  solicitarServicioAccion.mockReset();
  cotizarServicio.mockImplementation(async (_id: string, horas: number) => ({ ok: true, cotizacion: cotizacion(horas) }));
});

describe("FormularioContratacion", () => {
  it("muestra la cotización que ya calculó el servidor sin pedirla otra vez al abrir", () => {
    mostrar();

    expect(screen.getByText(/21\.600/)).toBeInTheDocument();
    expect(screen.getByText(/Cargo de servicio \(8 %\)/)).toBeInTheDocument();
    expect(cotizarServicio).not.toHaveBeenCalled();
  });

  it("al cambiar las horas le pide el precio al SERVIDOR y muestra el que responde", async () => {
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: "Aumentar número de horas" }));

    expect(cotizarServicio).toHaveBeenCalledWith(UUID, 2);
    await waitFor(() => expect(screen.getByText(/43\.200/)).toBeInTheDocument());
  });

  it("una respuesta vieja no pisa a la nueva (cambió las horas dos veces seguidas)", async () => {
    let resolverLaPrimera: (valor: unknown) => void = () => undefined;
    cotizarServicio.mockImplementationOnce(() => new Promise((resolver) => (resolverLaPrimera = resolver)));
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: "Aumentar número de horas" })); // 2 h: queda pendiente
    await userEvent.click(screen.getByRole("button", { name: "Aumentar número de horas" })); // 3 h: responde ya
    await waitFor(() => expect(screen.getByText(/64\.800/)).toBeInTheDocument());

    resolverLaPrimera({ ok: true, cotizacion: cotizacion(2) }); // llega tarde la de 2 h
    await new Promise((resolver) => setTimeout(resolver, 20));

    expect(screen.getByText(/64\.800/)).toBeInTheDocument();
    expect(screen.queryByText(/43\.200/)).not.toBeInTheDocument();
  });

  it("si el servidor no puede calcular el precio, lo dice, permite reintentar y no deja enviar", async () => {
    cotizarServicio.mockResolvedValueOnce({ ok: false, mensaje: "El servicio no responde por ahora." });
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: "Aumentar número de horas" }));

    expect(await screen.findByText("No pudimos calcular el precio")).toBeInTheDocument();
    cotizarServicio.mockResolvedValueOnce({ ok: true, cotizacion: cotizacion(2) });
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.queryByText("No pudimos calcular el precio")).not.toBeInTheDocument());
  });

  it("envía la solicitud con la fecha de Colombia, la franja, las horas y el medio, y va al servicio creado", async () => {
    solicitarServicioAccion.mockResolvedValue({ ok: true, servicioId: "servicio-1" });
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/servicios/servicio-1?nuevo=1"));
    const [datos, clave] = solicitarServicioAccion.mock.calls[0] as [Record<string, unknown>, string];
    // Son las 9 a. m. en Colombia: hoy, y la primera franja que sigue vigente es la mañana.
    expect(datos).toEqual({ cuidadorId: UUID, fecha: "2026-11-01", jornada: "manana", horas: 1, medioDePago: "pasarela" });
    expect(clave.length).toBeGreaterThanOrEqual(8);
    // Nada de dinero viaja del navegador.
    expect(JSON.stringify(datos)).not.toMatch(/total|subtotal|cargo|monto/i);
  });

  it("reintentar el MISMO envío usa la misma clave; cambiar algo usa otra (la misma clave con otros datos es un 409)", async () => {
    solicitarServicioAccion.mockResolvedValue({ ok: false, mensaje: "No hay conexión." });
    mostrar();
    // Como una persona: espera a que el botón vuelva a estar disponible (mientras envía dice «Enviando…»).
    const enviar = async () => userEvent.click(await screen.findByRole("button", { name: "Enviar solicitud" }));

    await enviar();
    await screen.findByText("No pudimos enviar la solicitud");
    await enviar();
    await waitFor(() => expect(solicitarServicioAccion).toHaveBeenCalledTimes(2));
    const [primera, segunda] = solicitarServicioAccion.mock.calls.map((llamada) => llamada[1] as string);
    expect(segunda).toBe(primera);

    await userEvent.click(screen.getByRole("button", { name: "Aumentar número de horas" }));
    await waitFor(() => expect(screen.getByText(/43\.200/)).toBeInTheDocument());
    await enviar();
    await waitFor(() => expect(solicitarServicioAccion).toHaveBeenCalledTimes(3));
    expect(solicitarServicioAccion.mock.calls[2]?.[1]).not.toBe(primera);
  });

  it("muestra el error del backend (por ejemplo, franja ocupada) y no navega", async () => {
    solicitarServicioAccion.mockResolvedValue({ ok: false, mensaje: "Ese cuidador ya tiene un servicio en ese horario." });
    mostrar();

    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByText(/ya tiene un servicio en ese horario/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("a las 8 p. m. de hoy solo queda la noche; sin franjas, lo dice y no deja enviar", async () => {
    mostrar({ ahora: { hoy: "2026-11-01", minutos: 20 * 60 } });
    const franjas = screen.getByRole("group", { name: "Elegir franja horaria" });
    expect(franjas).toHaveTextContent("Noche");
    expect(franjas).not.toHaveTextContent("Mañana");
    expect(franjas).not.toHaveTextContent("Tarde");
  });

  it("si el cuidador solo atiende de mañana y ya pasó, no hay franjas hoy y el botón queda desactivado", () => {
    mostrar({ cuidador: { ...cuidador, disponibilidad: ["manana"] }, ahora: { hoy: "2026-11-01", minutos: 15 * 60 } });

    expect(screen.getByText(/ya no quedan franjas con este cuidador/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar solicitud" })).toBeDisabled();
  });

  it("la bolsa: se ofrece solo si tiene saldo, y se bloquea si no alcanza para el total", () => {
    mostrar({ saldoDeLaBolsa: 10_000 });

    expect(screen.getByText(/no alcanza para este servicio/)).toBeInTheDocument();
    // El interruptor de la biblioteca no es un <button disabled>: se marca como desactivado para quien lo usa.
    expect(screen.getByRole("switch", { name: /Pagar con mi bolsa/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("sin saldo en la bolsa, no se muestra la opción", () => {
    mostrar({ saldoDeLaBolsa: 0 });

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("con saldo suficiente, se paga con la bolsa y se envía ese medio", async () => {
    solicitarServicioAccion.mockResolvedValue({ ok: true, servicioId: "s-1" });
    mostrar({ saldoDeLaBolsa: 100_000 });

    await userEvent.click(screen.getByRole("switch", { name: /Pagar con mi bolsa/ }));
    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(solicitarServicioAccion).toHaveBeenCalled());
    expect(solicitarServicioAccion.mock.calls[0]?.[0]).toMatchObject({ medioDePago: "bolsa" });
  });

  it("explica el plazo del cuidador y que solo se cobra cuando acepta", () => {
    mostrar();

    expect(screen.getByText(/hasta 2 horas para aceptar/)).toBeInTheDocument();
    expect(screen.getByText(/Solo se te cobra cuando acepta/)).toBeInTheDocument();
  });
});
