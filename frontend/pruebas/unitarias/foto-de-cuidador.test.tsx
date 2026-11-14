import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FotoDeCuidador } from "@/components/cuidadores/foto-de-cuidador";

describe("FotoDeCuidador", () => {
  it("sin foto, muestra solo las iniciales y no hay nada para abrir", () => {
    render(<FotoDeCuidador nombre="Marta Gómez" foto="" />);

    expect(screen.getByText("MG")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("con foto, un toque la abre en grande con el nombre", async () => {
    const usuario = userEvent.setup();
    render(<FotoDeCuidador nombre="Marta Gómez" foto="https://cdn.ejemplo/marta.jpg" />);

    await usuario.click(screen.getByRole("button", { name: /ver la foto de marta gómez en grande/i }));

    const grande = await screen.findByRole("img", { name: "Foto de Marta Gómez" });
    expect(grande).toHaveAttribute("src", "https://cdn.ejemplo/marta.jpg");
    expect(screen.getAllByText("Marta Gómez").length).toBeGreaterThan(0);
  });
});
