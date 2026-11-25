import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResumenDelPanel } from "@/components/admin/resumen-del-panel";
import type { EstadisticasDeCuidadores, EstadisticasDeServicios } from "@/lib/services/estadisticas";

const servicios: EstadisticasDeServicios = {
  total: 1200,
  porEstado: { solicitado: 10, aceptado: 20, en_curso: 5, finalizado: 1100, cancelado: 65 },
  solicitadosUltimos7Dias: 30,
  solicitadosUltimos30Dias: 120,
  horasAtendidas: 4800,
};

const cuidadores: EstadisticasDeCuidadores = {
  total: 40,
  porEstado: { borrador: 3, en_revision: 5, activo: 30, suspendido: 2 },
  visibles: 28,
  visiblesPorEspecialidad: { auxiliar: 10, enfermeria: 12, fisioterapia: 4, acompanamiento: 2 },
  verificacionesPendientes: 7,
  calificacionPromedio: 4.6,
  totalDeResenas: 310,
  serviciosCompletados: 1100,
};

describe("ResumenDelPanel", () => {
  it("muestra las cifras de servicios y de cuidadores, cada una en su tarjeta", () => {
    render(<ResumenDelPanel servicios={servicios} cuidadores={cuidadores} />);

    const tarjetaDeServicios = screen.getByRole("article", { name: "Servicios" });
    expect(within(tarjetaDeServicios).getByText("En total").nextSibling).toHaveTextContent("1.200");
    expect(within(tarjetaDeServicios).getByText("En curso ahora").nextSibling).toHaveTextContent("5");
    expect(within(tarjetaDeServicios).getByText("Horas atendidas").nextSibling).toHaveTextContent("4.800");
    expect(within(tarjetaDeServicios).getByText("Cancelados")).toBeInTheDocument();

    const tarjetaDeCuidadores = screen.getByRole("article", { name: "Cuidadores" });
    expect(within(tarjetaDeCuidadores).getByText("Registrados").nextSibling).toHaveTextContent("40");
    expect(within(tarjetaDeCuidadores).getByText("Visibles para familias").nextSibling).toHaveTextContent("28");
    expect(within(tarjetaDeCuidadores).getByText("Verificaciones por revisar").nextSibling).toHaveTextContent("7");
    expect(within(tarjetaDeCuidadores).getByText("Calificación promedio").nextSibling).toHaveTextContent("4.6");
    expect(within(tarjetaDeCuidadores).getByText("Enfermería")).toBeInTheDocument();
  });

  it("sin reseñas, dice «Sin reseñas» en lugar de un promedio", () => {
    render(<ResumenDelPanel servicios={servicios} cuidadores={{ ...cuidadores, calificacionPromedio: null, totalDeResenas: 0 }} />);

    expect(screen.getByText("Sin reseñas")).toBeInTheDocument();
  });

  it("sin ningún dato (totales en cero), no rompe ni divide entre cero", () => {
    const vacios: EstadisticasDeServicios = { total: 0, porEstado: { solicitado: 0, aceptado: 0, en_curso: 0, finalizado: 0, cancelado: 0 }, solicitadosUltimos7Dias: 0, solicitadosUltimos30Dias: 0, horasAtendidas: 0 };
    render(<ResumenDelPanel servicios={vacios} cuidadores={null} />);

    expect(screen.getByRole("article", { name: "Servicios" })).toBeInTheDocument();
  });

  it("si una de las dos lecturas falló, avisa en esa tarjeta y deja la otra", () => {
    render(<ResumenDelPanel servicios={null} cuidadores={cuidadores} />);

    expect(screen.getByText(/no pudimos cargar los servicios/i)).toBeInTheDocument();
    expect(screen.getByText("Registrados")).toBeInTheDocument();
  });
});
