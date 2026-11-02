import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SelectorDeTipoDeCuenta } from "@/components/cuenta/selector-de-tipo-de-cuenta";

// El selector de familia/cuidador en el registro: debe verse arriba del todo (no un enlace escondido al final) y
// decir con claridad cuál de los dos caminos está activo.
describe("SelectorDeTipoDeCuenta", () => {
  it("en familia, marca «Soy familia» como la página actual", () => {
    render(<SelectorDeTipoDeCuenta comoCuidador={false} />);

    expect(screen.getByRole("link", { name: "Soy familia" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Soy familia" })).toHaveAttribute("href", "/registro");
    expect(screen.getByRole("link", { name: "Soy cuidador" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Soy cuidador" })).toHaveAttribute("href", "/registro/cuidador");
  });

  it("en cuidador, marca «Soy cuidador» como la página actual", () => {
    render(<SelectorDeTipoDeCuenta comoCuidador />);

    expect(screen.getByRole("link", { name: "Soy cuidador" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Soy familia" })).not.toHaveAttribute("aria-current");
  });
});
