import { describe, expect, it } from "vitest";
import { agruparPorCuidador } from "@/lib/agrupar-revision";
import type { DocumentoSubido, HojaDeVidaPorRevisar, VerificacionParaRevisor } from "@/lib/types";

const documento = (extra: Partial<DocumentoSubido> = {}): DocumentoSubido => ({
  id: "d1",
  tipo: "cedula",
  nombre: "cedula.pdf",
  estado: "pendiente",
  tamanoBytes: 2048,
  subidoEn: "2026-11-01T15:00:00.000Z",
  ...extra,
});

const verificacion = (extra: Partial<VerificacionParaRevisor> = {}): VerificacionParaRevisor => ({
  id: "v1",
  control: "antecedentes",
  estado: "pendiente",
  solicitadaEn: "2026-11-01T15:00:00.000Z",
  cuidador: { id: "c1", nombre: "Marta Gómez", especialidad: "enfermeria", zona: "Laureles" },
  documentos: [documento()],
  ...extra,
});

const hoja = (extra: Partial<HojaDeVidaPorRevisar> = {}): HojaDeVidaPorRevisar => ({
  documento: documento({ id: "d-hoja", tipo: "hoja_de_vida" }),
  cuidador: { id: "c1", nombre: "Marta Gómez" },
  ...extra,
});

describe("agruparPorCuidador", () => {
  it("junta los controles del mismo cuidador en un solo grupo, en el orden en que llegaron", () => {
    const grupos = agruparPorCuidador(
      [
        verificacion({ id: "v1", control: "antecedentes", solicitadaEn: "2026-11-01T15:00:00.000Z" }),
        verificacion({ id: "v2", control: "titulos", solicitadaEn: "2026-11-02T15:00:00.000Z" }),
        verificacion({ id: "v3", control: "psicotecnica", cuidador: { id: "c2", nombre: "Ana Ríos", especialidad: "fisioterapia", zona: "Envigado" }, solicitadaEn: "2026-11-03T15:00:00.000Z" }),
      ],
      [],
    );

    expect(grupos).toHaveLength(2);
    expect(grupos[0]?.cuidadorId).toBe("c1");
    expect(grupos[0]?.controles.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(grupos[1]?.cuidadorId).toBe("c2");
  });

  it("ordena los grupos por la solicitud más antigua de cada persona, aunque la más vieja no sea la primera que llegó", () => {
    const grupos = agruparPorCuidador(
      [
        verificacion({ id: "v1", solicitadaEn: "2026-11-05T15:00:00.000Z", cuidador: { id: "c1", nombre: "Marta Gómez", especialidad: "enfermeria", zona: "Laureles" } }),
        verificacion({ id: "v2", solicitadaEn: "2026-11-01T15:00:00.000Z", cuidador: { id: "c2", nombre: "Ana Ríos", especialidad: "fisioterapia", zona: "Envigado" } }),
      ],
      [],
    );

    expect(grupos.map((g) => g.cuidadorId)).toEqual(["c2", "c1"]);
  });

  it("la hoja de vida de alguien que ya tiene controles pendientes se une al mismo grupo", () => {
    const grupos = agruparPorCuidador([verificacion({ solicitadaEn: "2026-11-02T15:00:00.000Z" })], [hoja({ documento: documento({ id: "d-hoja", subidoEn: "2026-11-01T15:00:00.000Z" }) })]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.controles).toHaveLength(1);
    expect(grupos[0]?.hoja?.documento.id).toBe("d-hoja");
    // La hoja es anterior al control: esa es la fecha que manda para ordenar.
    expect(grupos[0]?.masAntigua).toBe("2026-11-01T15:00:00.000Z");
  });

  it("una hoja de vida sin controles pendientes forma su propio grupo, sin zona ni especialidad", () => {
    const grupos = agruparPorCuidador([], [hoja()]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ cuidadorId: "c1", zona: null, especialidad: null, controles: [] });
  });
});
