import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CuidadorDelPanel } from "@/lib/services/cuidadores-del-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const { ListadoDeCuidadores } = await import("@/components/admin/listado-de-cuidadores");
const { PestanasDelPanel } = await import("@/components/admin/pestanas-del-panel");

function cuidador(cambios: Partial<CuidadorDelPanel>): CuidadorDelPanel {
  return {
    id: "0198aaaa-0000-7000-8000-000000000001",
    nombre: "Marta Gómez",
    foto: "",
    especialidad: "enfermeria",
    zona: "Manrique",
    estado: "activo",
    visible: true,
    calificacion: 4.8,
    cantidadResenas: 12,
    serviciosCompletados: 30,
    ...cambios,
  };
}

describe("ListadoDeCuidadores", () => {
  it("muestra a cada cuidador con su nombre, estado, calificación y servicios", () => {
    render(<ListadoDeCuidadores cuidadores={[cuidador({})]} hayMas={false} busqueda="" estado={undefined} />);

    const tarjeta = screen.getByRole("listitem", { name: "Marta Gómez" });
    expect(within(tarjeta).getByText("Visible")).toBeInTheDocument();
    expect(within(tarjeta).getByText("4.8")).toBeInTheDocument();
    expect(within(tarjeta).getByText("(12)")).toBeInTheDocument();
    expect(within(tarjeta).getByText("30 servicios completados")).toBeInTheDocument();
    expect(within(tarjeta).getByText(/Enfermería · Manrique/)).toBeInTheDocument();
  });

  it("al tocar un cuidador se entra a su expediente: sus verificaciones y documentos", () => {
    render(<ListadoDeCuidadores cuidadores={[cuidador({})]} hayMas={false} busqueda="" estado={undefined} />);

    const enlace = within(screen.getByRole("listitem", { name: "Marta Gómez" })).getByRole("link");
    expect(enlace).toHaveAttribute("href", "/admin/cuidadores/0198aaaa-0000-7000-8000-000000000001");
    expect(within(enlace).getByText("Ver verificación y documentos")).toBeInTheDocument();
  });

  it("distingue cada estado, y al activo que no se ve lo marca aparte", () => {
    render(
      <ListadoDeCuidadores
        cuidadores={[
          cuidador({ id: "1", nombre: "Ana", estado: "activo", visible: false }),
          cuidador({ id: "2", nombre: "Beto", estado: "en_revision", visible: false }),
          cuidador({ id: "3", nombre: "Carla", estado: "suspendido", visible: false }),
          cuidador({ id: "4", nombre: "Diego", estado: "borrador", visible: false, calificacion: null, cantidadResenas: 0, serviciosCompletados: 1 }),
        ]}
        hayMas={false}
        busqueda=""
        estado={undefined}
      />,
    );

    expect(within(screen.getByRole("listitem", { name: "Ana" })).getByText("Activo, no visible")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Beto" })).getByText("En revisión")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Carla" })).getByText("Suspendido")).toBeInTheDocument();
    const diego = screen.getByRole("listitem", { name: "Diego" });
    expect(within(diego).getByText("Borrador")).toBeInTheDocument();
    expect(within(diego).getByText("Sin reseñas")).toBeInTheDocument();
    expect(within(diego).getByText("1 servicio completado")).toBeInTheDocument();
  });

  it("el buscador conserva lo escrito y el filtro de estado al buscar", () => {
    render(<ListadoDeCuidadores cuidadores={[cuidador({})]} hayMas={false} busqueda="marta" estado="activo" />);

    const buscador = screen.getByRole("searchbox", { name: /buscar cuidador/i });
    expect(buscador).toHaveValue("marta");
    expect(buscador.closest("form")).toHaveAttribute("method", "get");
    expect(buscador.closest("form")?.querySelector('input[name="estado"]')).toHaveValue("activo");
    expect(screen.getByRole("link", { name: "Activos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "En revisión" })).toHaveAttribute("href", "/admin?busqueda=marta&estado=en_revision");
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("href", "/admin?busqueda=marta");
  });

  it("sin resultados con un filtro, ofrece quitarlo; sin cuidadores, lo dice", () => {
    const { rerender } = render(<ListadoDeCuidadores cuidadores={[]} hayMas={false} busqueda="zzz" estado={undefined} />);
    expect(screen.getByText("Ningún cuidador coincide con tu búsqueda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quitar filtros" })).toHaveAttribute("href", "/admin");

    rerender(<ListadoDeCuidadores cuidadores={[]} hayMas={false} busqueda="" estado={undefined} />);
    expect(screen.getByText("Todavía no hay cuidadores registrados")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Quitar filtros" })).not.toBeInTheDocument();
  });

  it("si hay más de los mostrados, invita a afinar la búsqueda", () => {
    render(<ListadoDeCuidadores cuidadores={[cuidador({})]} hayMas busqueda="" estado={undefined} />);

    expect(screen.getByText(/escribe en el buscador para afinar/i)).toBeInTheDocument();
  });
});

describe("PestanasDelPanel", () => {
  it("marca la pestaña activa y lleva a cada sección", () => {
    render(<PestanasDelPanel activa="cuidadores" />);

    expect(screen.getByRole("link", { name: "Cuidadores" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cuidadores" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Verificaciones" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Verificaciones" })).toHaveAttribute("href", "/admin/revision");
  });
});
