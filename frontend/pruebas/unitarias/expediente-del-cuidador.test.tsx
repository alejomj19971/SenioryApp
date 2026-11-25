import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExpedienteDeCuidador } from "@/lib/services/verificaciones";
import type { DocumentoSubido } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/acciones/postulacion", () => ({ decidirControlAccion: vi.fn(), decidirHojaDeVidaAccion: vi.fn() }));

const { ExpedienteDelCuidador } = await import("@/components/admin/expediente-del-cuidador");

const documento = (extra: Partial<DocumentoSubido>): DocumentoSubido => ({
  id: "d1",
  tipo: "cedula",
  nombre: "cedula.pdf",
  estado: "pendiente",
  tamanoBytes: 2048,
  subidoEn: "2026-11-01T15:00:00.000Z",
  ...extra,
});

const expediente = (extra: Partial<ExpedienteDeCuidador> = {}): ExpedienteDeCuidador => ({
  cuidador: {
    id: "c1",
    nombre: "Marta Gómez",
    foto: "",
    especialidad: "enfermeria",
    titulo: "Técnica en Enfermería",
    aniosExperiencia: 7,
    zona: "Manrique",
    estado: "en_revision",
    visible: false,
    calificacion: null,
    cantidadResenas: 0,
    serviciosCompletados: 0,
    registradoEn: "2026-10-01T15:00:00.000Z",
  },
  controles: [
    { control: "antecedentes", estado: "pendiente", verificacionId: "v1", solicitadaEn: "2026-11-01T15:00:00.000Z", revisadoEn: null, motivoDeRechazo: null, vigenteHasta: null },
    { control: "titulos", estado: "rechazada", verificacionId: "v2", solicitadaEn: "2026-10-20T15:00:00.000Z", revisadoEn: "2026-10-21T15:00:00.000Z", motivoDeRechazo: "El título no se lee bien", vigenteHasta: null },
    { control: "psicotecnica", estado: "sin_solicitar", verificacionId: null, solicitadaEn: null, revisadoEn: null, motivoDeRechazo: null, vigenteHasta: null },
  ],
  documentos: [],
  ...extra,
});

describe("ExpedienteDelCuidador", () => {
  it("muestra quién es y cada control en su estado, con el motivo si lo rechazaron", () => {
    render(<ExpedienteDelCuidador expediente={expediente()} />);

    expect(screen.getByRole("heading", { name: "Marta Gómez" })).toBeInTheDocument();
    expect(screen.getByText("No visible")).toBeInTheDocument();
    const titulos = screen.getByRole("listitem", { name: "Títulos" });
    expect(within(titulos).getByText("Rechazado")).toBeInTheDocument();
    expect(within(titulos).getByText(/El título no se lee bien/)).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Prueba psicotécnica" })).getByText(/todavía no pidió esta verificación/i)).toBeInTheDocument();
  });

  it("un control pendiente se puede decidir ahí mismo, con los documentos que hay que mirar", () => {
    render(
      <ExpedienteDelCuidador
        expediente={expediente({
          documentos: [documento({ id: "d-ced", tipo: "cedula", nombre: "cedula.pdf" }), documento({ id: "d-ant", tipo: "antecedentes", nombre: "antecedentes.pdf" })],
        })}
      />,
    );

    const antecedentes = screen.getByRole("listitem", { name: "Antecedentes" });
    expect(within(antecedentes).getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
    expect(within(antecedentes).getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
    expect(within(antecedentes).getByRole("link", { name: /Antecedentes\s*\(antecedentes\.pdf\)/ })).toHaveAttribute("href", "/api/admin/documentos/d-ant");
    // Un control ya decidido no vuelve a ofrecer la decisión.
    expect(within(screen.getByRole("listitem", { name: "Títulos" })).queryByRole("button")).not.toBeInTheDocument();
  });

  it("lista todos los documentos por tipo, cada uno con su enlace y estado, y avisa cuando hay versiones anteriores", () => {
    render(
      <ExpedienteDelCuidador
        expediente={expediente({
          documentos: [
            documento({ id: "t2", tipo: "titulo", nombre: "titulo-nuevo.pdf", estado: "pendiente" }),
            documento({ id: "t1", tipo: "titulo", nombre: "titulo-viejo.pdf", estado: "rechazado" }),
            documento({ id: "c1", tipo: "cedula", nombre: "cedula.pdf", estado: "aprobado" }),
          ],
        })}
      />,
    );

    const grupoDeTitulo = screen.getByRole("group", { name: "Título" });
    const enlaces = within(grupoDeTitulo).getAllByRole("link");
    expect(enlaces.map((e) => e.getAttribute("href"))).toEqual(["/api/admin/documentos/t2", "/api/admin/documentos/t1"]);
    expect(within(grupoDeTitulo).getByText("Rechazado")).toBeInTheDocument();
    expect(within(grupoDeTitulo).getByText(/los demás los reemplazó una subida nueva/i)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Cédula" })).getByText("Aprobado")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Hoja de vida" })).not.toBeInTheDocument();
  });

  it("sin documentos, lo dice; con la hoja de vida por revisar, ofrece decidirla", () => {
    const { rerender } = render(<ExpedienteDelCuidador expediente={expediente()} />);
    expect(screen.getByText(/todavía no ha subido documentos/i)).toBeInTheDocument();

    rerender(<ExpedienteDelCuidador expediente={expediente({ documentos: [documento({ id: "h1", tipo: "hoja_de_vida", nombre: "hoja.pdf", estado: "pendiente" })] })} />);
    expect(screen.getByRole("listitem", { name: "Hoja de vida" })).toBeInTheDocument();
  });
});
