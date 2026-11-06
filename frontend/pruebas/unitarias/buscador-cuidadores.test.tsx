import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CuidadorResumen } from "@/lib/types";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/app/cuidadores",
}));

const cargarMasCuidadores = vi.fn();
vi.mock("@/lib/acciones/cuidadores", () => ({ cargarMasCuidadores }));

const { BuscadorCuidadores } = await import("@/components/cuidadores/buscador-cuidadores");

const cuidador = (n: number, extra: Partial<CuidadorResumen> = {}): CuidadorResumen => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  nombre: `Cuidadora ${n}`,
  foto: "",
  especialidad: "enfermeria",
  titulo: "Técnica",
  aniosExperiencia: 3,
  tarifaHora: 20_000,
  zona: "Laureles",
  disponibilidad: ["tarde"],
  calificacion: 4.5,
  cantidadResenas: 2,
  serviciosCompletados: 1,
  bio: "",
  verificacion: { antecedentes: true, titulos: true, psicotecnica: true },
  distanciaKm: null,
  ...extra,
});

function mostrar(propiedades: Partial<React.ComponentProps<typeof BuscadorCuidadores>> = {}) {
  return render(
    <BuscadorCuidadores
      cuidadores={[cuidador(1), cuidador(2, { calificacion: null, cantidadResenas: 0 })]}
      siguiente={null}
      filtros={{}}
      zonas={["Belén", "Laureles"]}
      tarifaLimite={38_000}
      {...propiedades}
    />,
  );
}

beforeEach(() => {
  replace.mockClear();
  cargarMasCuidadores.mockReset();
});

describe("BuscadorCuidadores", () => {
  it("muestra los cuidadores que trae el servidor y cuenta cuántos hay", () => {
    mostrar();

    expect(screen.getByText("Cuidadora 1")).toBeInTheDocument();
    expect(screen.getByText("2 cuidadores encontrados")).toBeInTheDocument();
  });

  it("una calificación nula se dice con palabras, no como «0 estrellas»", () => {
    mostrar();

    expect(screen.getByText("Sin reseñas todavía")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
  });

  it("no ofrece «Ver más» si no hay siguiente página", () => {
    mostrar();

    expect(screen.queryByRole("button", { name: /Ver más cuidadores/ })).not.toBeInTheDocument();
  });

  it("«Ver más» pide la siguiente página con el cursor y los mismos filtros, y la agrega sin repetir", async () => {
    cargarMasCuidadores.mockResolvedValue({
      ok: true,
      pagina: { cuidadores: [cuidador(2), cuidador(3)], siguiente: null },
    });
    mostrar({ siguiente: "cursor-1", filtros: { zona: "Laureles" } });
    expect(screen.getByText("2 o más cuidadores encontrados")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ver más cuidadores" }));

    expect(cargarMasCuidadores).toHaveBeenCalledWith({ zona: "Laureles" }, "cursor-1");
    await waitFor(() => expect(screen.getByText("Cuidadora 3")).toBeInTheDocument());
    // La 2 ya estaba: no se repite.
    expect(screen.getAllByText("Cuidadora 2")).toHaveLength(1);
    expect(screen.getByText("3 cuidadores encontrados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver más/ })).not.toBeInTheDocument();
  });

  it("si «Ver más» falla, lo dice y permite reintentar (sin perder lo ya mostrado)", async () => {
    cargarMasCuidadores.mockResolvedValueOnce({ ok: false, mensaje: "El servicio no responde por ahora." });
    mostrar({ siguiente: "cursor-1" });

    await userEvent.click(screen.getByRole("button", { name: "Ver más cuidadores" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No pudimos cargar más cuidadores");
    expect(aviso).toHaveTextContent("El servicio no responde por ahora.");
    expect(screen.getByText("Cuidadora 1")).toBeInTheDocument();

    cargarMasCuidadores.mockResolvedValueOnce({ ok: true, pagina: { cuidadores: [cuidador(3)], siguiente: null } });
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("Cuidadora 3")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("una búsqueda nueva descarta las páginas de «Ver más» de la anterior, sin remontar la pantalla", async () => {
    cargarMasCuidadores.mockResolvedValue({ ok: true, pagina: { cuidadores: [cuidador(3)], siguiente: null } });
    const { rerender } = mostrar({ siguiente: "cursor-1" });
    await userEvent.click(screen.getByRole("button", { name: "Ver más cuidadores" }));
    await waitFor(() => expect(screen.getByText("Cuidadora 3")).toBeInTheDocument());

    // El servidor responde a una búsqueda nueva: primera página distinta, con otra página siguiente.
    rerender(
      <BuscadorCuidadores cuidadores={[cuidador(4)]} siguiente="cursor-9" filtros={{ zona: "Belén" }} zonas={["Belén", "Laureles"]} tarifaLimite={38_000} />,
    );

    expect(screen.getByText("Cuidadora 4")).toBeInTheDocument();
    expect(screen.queryByText("Cuidadora 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Cuidadora 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver más cuidadores" })).toBeInTheDocument();
  });

  it("el campo de búsqueda conserva el foco y los filtros abiertos mientras se busca (no se remonta)", async () => {
    const { rerender } = mostrar();
    const campo = screen.getByRole("textbox", { name: /Buscar por nombre/ });
    await userEvent.click(screen.getByRole("button", { name: "Mostrar u ocultar filtros" }));
    await userEvent.type(campo, "ma");

    rerender(
      <BuscadorCuidadores cuidadores={[cuidador(1)]} siguiente={null} filtros={{ busqueda: "ma" }} zonas={["Belén"]} tarifaLimite={38_000} />,
    );

    expect(campo).toHaveFocus();
    expect(campo).toHaveValue("ma");
    expect(screen.getByRole("group", { name: "Filtrar por especialidad" })).toBeInTheDocument();
  });

  it("sin cuidadores y sin filtros, lo dice sin ofrecer «Quitar filtros»", () => {
    mostrar({ cuidadores: [], filtros: {} });

    expect(screen.getByText("Todavía no hay cuidadores disponibles")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar filtros" })).not.toBeInTheDocument();
  });

  it("sin resultados con filtros, ofrece quitarlos", () => {
    mostrar({ cuidadores: [], filtros: { zona: "Belén" } });

    expect(screen.getByText("No encontramos cuidadores con esos filtros")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar filtros" })).toBeInTheDocument();
  });

  it("al escribir en la búsqueda, actualiza la URL (con espera) para que el servidor busque", async () => {
    mostrar();

    await userEvent.type(screen.getByRole("textbox", { name: /Buscar por nombre/ }), "marta");

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    expect(replace).toHaveBeenCalledWith("/app/cuidadores?busqueda=marta", { scroll: false });
  });

  it("no toca la URL al montarse", async () => {
    mostrar({ filtros: { zona: "Laureles" } });

    await new Promise((resolver) => setTimeout(resolver, 600));
    expect(replace).not.toHaveBeenCalled();
  });
});
