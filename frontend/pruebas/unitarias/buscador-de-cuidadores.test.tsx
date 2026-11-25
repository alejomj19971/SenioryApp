import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const { BuscadorDeCuidadores } = await import("@/components/admin/buscador-de-cuidadores");

const campo = () => screen.getByRole("searchbox", { name: /buscar cuidador/i });
const escribir = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });
const pasar = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("BuscadorDeCuidadores", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("busca mientras se escribe, esperando un momento después de la última tecla", () => {
    render(<BuscadorDeCuidadores busqueda="" estado={undefined} />);

    escribir("mar");
    // Todavía no: puede seguir escribiendo.
    pasar(299);
    expect(replace).not.toHaveBeenCalled();

    pasar(1);

    // Una sola búsqueda, con lo que quedó escrito, sin saltar al inicio de la página.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/admin?busqueda=mar", { scroll: false });
  });

  it("no busca en cada letra: cada tecla nueva reinicia la espera", () => {
    render(<BuscadorDeCuidadores busqueda="" estado={undefined} />);

    escribir("m");
    pasar(200);
    escribir("ma");
    pasar(200);
    expect(replace).not.toHaveBeenCalled();

    pasar(100);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/admin?busqueda=ma", { scroll: false });
  });

  it("conserva el filtro de estado al buscar", () => {
    render(<BuscadorDeCuidadores busqueda="" estado="en_revision" />);

    escribir("ana");
    pasar(300);

    expect(replace).toHaveBeenCalledWith("/admin?busqueda=ana&estado=en_revision", { scroll: false });
  });

  it("Enter busca al instante, sin esperar", () => {
    render(<BuscadorDeCuidadores busqueda="" estado={undefined} />);

    escribir("ana");
    fireEvent.submit(screen.getByRole("search"));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/admin?busqueda=ana", { scroll: false });
    // Y la espera pendiente no lo repite.
    pasar(500);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("no vuelve a buscar lo que ya está buscado, ni por espacios de más", () => {
    render(<BuscadorDeCuidadores busqueda="ana" estado={undefined} />);

    escribir("ana  ");
    pasar(500);

    expect(replace).not.toHaveBeenCalled();
  });

  it("el botón de borrar limpia el campo y quita la búsqueda al instante", () => {
    render(<BuscadorDeCuidadores busqueda="ana" estado={undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Borrar la búsqueda" }));

    expect(campo()).toHaveValue("");
    expect(replace).toHaveBeenCalledWith("/admin", { scroll: false });
  });

  it("si la búsqueda cambia desde fuera (quitar filtros), el campo la sigue", () => {
    const { rerender } = render(<BuscadorDeCuidadores busqueda="ana" estado={undefined} />);
    expect(campo()).toHaveValue("ana");

    rerender(<BuscadorDeCuidadores busqueda="" estado={undefined} />);

    expect(campo()).toHaveValue("");
  });

  it("al llegar el resultado de una búsqueda anterior, no pisa lo que ya se escribió después", () => {
    const { rerender } = render(<BuscadorDeCuidadores busqueda="" estado={undefined} />);

    escribir("mar");
    pasar(300);
    escribir("marta");
    // Llega la respuesta de «mar» cuando ya se escribió «marta».
    rerender(<BuscadorDeCuidadores busqueda="mar" estado={undefined} />);

    expect(campo()).toHaveValue("marta");
  });
});
