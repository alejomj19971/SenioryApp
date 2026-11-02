import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PantallaDeError } from "@/components/shell/pantalla-de-error";

// El error boundary compartido de cada área (F10 §7: /app, /cuidador, /admin y el resto ya no se quedan sin uno).
describe("PantallaDeError", () => {
  it("nunca muestra el mensaje crudo del error, solo el texto fijo", () => {
    render(<PantallaDeError rutaDeInicio="/app" etiquetaDeInicio="Ir al inicio" retry={vi.fn()} digest={undefined} />);

    expect(screen.getByRole("heading", { name: "No pudimos cargar esta información" })).toBeInTheDocument();
    expect(screen.queryByText(/código de soporte/i)).not.toBeInTheDocument();
  });

  it("con un digest, lo muestra para dar soporte", () => {
    render(<PantallaDeError rutaDeInicio="/cuidador" etiquetaDeInicio="Ir a tu panel" retry={vi.fn()} digest="abc123" />);

    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("«Reintentar» llama a retry(), y cada área lleva a SU propio inicio", async () => {
    const retry = vi.fn();
    const usuario = userEvent.setup();
    render(<PantallaDeError rutaDeInicio="/admin" etiquetaDeInicio="Ir al panel" retry={retry} digest={undefined} />);

    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Ir al panel" })).toHaveAttribute("href", "/admin");
  });
});
