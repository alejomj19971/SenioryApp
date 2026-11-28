import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const suspenderCuidadorAccion = vi.fn();
const reactivarCuidadorAccion = vi.fn();
vi.mock("@/lib/acciones/postulacion", () => ({ suspenderCuidadorAccion, reactivarCuidadorAccion }));

const { VisibilidadDelCuidador } = await import("@/components/admin/visibilidad-del-cuidador");

const ID = "0198aaaa-0000-7000-8000-000000000001";

describe("VisibilidadDelCuidador", () => {
  beforeEach(() => {
    suspenderCuidadorAccion.mockReset();
    reactivarCuidadorAccion.mockReset();
  });

  it("a un cuidador activo le ofrece suspender, sin hacerlo todavía", () => {
    render(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="activo" />);

    expect(screen.getByRole("button", { name: "Suspender cuidador" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sí, suspender" })).not.toBeInTheDocument();
    expect(suspenderCuidadorAccion).not.toHaveBeenCalled();
  });

  it("pide confirmación y dice qué va a pasar: se cancelan los servicios pendientes con devolución, y los que están en curso no se interrumpen", async () => {
    const usuario = userEvent.setup();
    render(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="activo" />);

    await usuario.click(screen.getByRole("button", { name: "Suspender cuidador" }));

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("¿Suspender a Marta Gómez?");
    expect(aviso).toHaveTextContent(/se cancelan sus servicios solicitados y aceptados, y se le devuelve todo el dinero/i);
    expect(aviso).toHaveTextContent(/los servicios que ya están en curso no se interrumpen/i);
    expect(aviso).toHaveTextContent(/su cuenta deja de poder iniciar sesión/i);
    expect(suspenderCuidadorAccion).not.toHaveBeenCalled();
  });

  it("«Cancelar» vuelve atrás sin suspender a nadie", async () => {
    const usuario = userEvent.setup();
    render(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="activo" />);

    await usuario.click(screen.getByRole("button", { name: "Suspender cuidador" }));
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: "Suspender cuidador" })).toBeInTheDocument();
    expect(suspenderCuidadorAccion).not.toHaveBeenCalled();
  });

  it("al confirmar, suspende a ese cuidador", async () => {
    suspenderCuidadorAccion.mockResolvedValue({ listo: true });
    const usuario = userEvent.setup();
    render(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="activo" />);

    await usuario.click(screen.getByRole("button", { name: "Suspender cuidador" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, suspender" }));

    await waitFor(() => expect(suspenderCuidadorAccion).toHaveBeenCalledTimes(1));
    expect(suspenderCuidadorAccion.mock.calls[0]?.[0]).toBe(ID);
  });

  it("si el backend no deja suspender, muestra el motivo y permite reintentar o cancelar", async () => {
    suspenderCuidadorAccion.mockResolvedValue({ mensaje: "Solo se puede suspender a un cuidador activo" });
    const usuario = userEvent.setup();
    render(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="activo" />);

    await usuario.click(screen.getByRole("button", { name: "Suspender cuidador" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, suspender" }));

    expect(await screen.findByText("Solo se puede suspender a un cuidador activo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("a un cuidador suspendido le ofrece reactivar y explica que los servicios cancelados no vuelven", async () => {
    reactivarCuidadorAccion.mockResolvedValue({ listo: true });
    const usuario = userEvent.setup();
    render(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="suspendido" />);

    expect(screen.getByText(/Marta Gómez está suspendido/)).toBeInTheDocument();
    expect(screen.getByText(/su cuenta no puede iniciar sesión/i)).toBeInTheDocument();
    expect(screen.getByText(/no se restablecen/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspender cuidador" })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Reactivar cuidador" }));

    await waitFor(() => expect(reactivarCuidadorAccion).toHaveBeenCalledTimes(1));
    expect(reactivarCuidadorAccion.mock.calls[0]?.[0]).toBe(ID);
  });

  it("en borrador o en revisión no hay nada que ofrecer", () => {
    const { container, rerender } = render(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="borrador" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<VisibilidadDelCuidador cuidadorId={ID} nombre="Marta Gómez" estado="en_revision" />);
    expect(container).toBeEmptyDOMElement();
  });
});
