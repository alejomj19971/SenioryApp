import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let ruta = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => ruta }));

const { NavAdmin } = await import("@/components/shell/nav-admin");
const { EncabezadoConAnalisis } = await import("@/components/admin/encabezado-con-analisis");

describe("NavAdmin", () => {
  beforeEach(() => {
    ruta = "/admin";
  });

  it("ofrece las tres secciones del panel", () => {
    render(<NavAdmin />);

    const menu = screen.getByRole("navigation", { name: "Navegación del panel" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cuidadores" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Verificaciones" })).toHaveAttribute("href", "/admin/revision");
    expect(screen.getByRole("link", { name: "Seguridad" })).toHaveAttribute("href", "/admin/seguridad");
  });

  it("marca «Cuidadores» en el inicio y dentro del expediente de un cuidador", () => {
    const { rerender } = render(<NavAdmin />);
    expect(screen.getByRole("link", { name: "Cuidadores" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Verificaciones" })).not.toHaveAttribute("aria-current");

    ruta = "/admin/cuidadores/0198aaaa-0000-7000-8000-000000000001";
    rerender(<NavAdmin />);
    expect(screen.getByRole("link", { name: "Cuidadores" })).toHaveAttribute("aria-current", "page");
  });

  it("marca solo la sección en la que se está", () => {
    ruta = "/admin/revision";
    const { rerender } = render(<NavAdmin />);
    expect(screen.getByRole("link", { name: "Verificaciones" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cuidadores" })).not.toHaveAttribute("aria-current");

    ruta = "/admin/seguridad";
    rerender(<NavAdmin />);
    expect(screen.getByRole("link", { name: "Seguridad" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Verificaciones" })).not.toHaveAttribute("aria-current");
  });

  it("es una barra inferior en el celular y pestañas en pantallas grandes (una sola navegación)", () => {
    render(<NavAdmin />);

    const menu = screen.getByRole("navigation", { name: "Navegación del panel" });
    expect(menu.className).toContain("fixed");
    expect(menu.className).toContain("bottom-0");
    expect(menu.className).toContain("md:static");
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });
});

describe("EncabezadoConAnalisis", () => {
  it("cerrado, ofrece «Ver análisis» y lleva a la misma página con el análisis abierto", () => {
    render(<EncabezadoConAnalisis titulo="Panel del administrador" subtitulo="Hola, Ana." abierto={false} direccionAlternada="/admin?analisis=1" />);

    expect(screen.getByRole("heading", { name: "Panel del administrador" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver análisis" })).toHaveAttribute("href", "/admin?analisis=1");
  });

  it("abierto, ofrece «Ocultar análisis» y lleva a la página sin el análisis", () => {
    render(<EncabezadoConAnalisis titulo="Panel del administrador" subtitulo="Hola, Ana." abierto direccionAlternada="/admin" />);

    expect(screen.getByRole("link", { name: "Ocultar análisis" })).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("link", { name: "Ver análisis" })).not.toBeInTheDocument();
  });
});
