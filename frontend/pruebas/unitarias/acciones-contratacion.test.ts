import { describe, expect, it, vi } from "vitest";
import { confirmarContratacionAccion } from "@/lib/acciones/contratacion";
import type { DatosContratacion } from "@/lib/types";

// El cuidador viene del directorio (la API); aquí se sustituye por uno conocido: esta prueba es de la acción y de
// su cálculo, no del directorio.
vi.mock("@/lib/services/cuidadores", () => ({
  obtenerCuidador: async (id: string) =>
    id === "c-marta-restrepo" ? { id, nombre: "Marta Elena Restrepo", tarifaHora: 20_000 } : null,
}));

const VALIDOS: DatosContratacion = {
  cuidadorId: "c-marta-restrepo",
  fecha: "2035-03-01",
  jornada: "tarde",
  horas: 1,
};

describe("confirmarContratacionAccion", () => {
  it("con datos válidos confirma y calcula el total: $20.000 por 1 hora = $21.600", async () => {
    const resultado = await confirmarContratacionAccion(VALIDOS);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.contratacion).toMatchObject({
      cuidadorNombre: "Marta Elena Restrepo",
      horas: 1,
      jornada: "tarde",
      resumen: { subtotal: 20_000, cargoFamilia: 1_600, totalFamilia: 21_600 },
    });
  });

  it.each([0, 9, -1, 1.5, Number.NaN])("rechaza %s horas", async (horas) => {
    const resultado = await confirmarContratacionAccion({ ...VALIDOS, horas });

    expect(resultado).toEqual({
      ok: false,
      mensaje: "Las horas deben ser un número entero entre 1 y 8.",
    });
  });

  it.each([1, 8])("acepta %s hora(s), los extremos del rango", async (horas) => {
    expect((await confirmarContratacionAccion({ ...VALIDOS, horas })).ok).toBe(true);
  });

  it.each(["mediodia", "", "TARDE"])("rechaza la jornada «%s»", async (jornada) => {
    const resultado = await confirmarContratacionAccion({
      ...VALIDOS,
      jornada: jornada as DatosContratacion["jornada"],
    });

    expect(resultado.ok).toBe(false);
  });

  it.each(["01/03/2035", "2035-3-1", "2035-02-30", "2035-13-01", "", "mañana"])(
    "rechaza la fecha «%s»",
    async (fecha) => {
      const resultado = await confirmarContratacionAccion({ ...VALIDOS, fecha });

      expect(resultado).toEqual({ ok: false, mensaje: "Elige una fecha válida." });
    },
  );

  it("acepta el 29 de febrero de un año bisiesto y rechaza el de uno que no lo es", async () => {
    expect((await confirmarContratacionAccion({ ...VALIDOS, fecha: "2036-02-29" })).ok).toBe(true);
    expect((await confirmarContratacionAccion({ ...VALIDOS, fecha: "2035-02-29" })).ok).toBe(false);
  });

  it.each(["", "   "])("rechaza un cuidador vacío («%s»)", async (cuidadorId) => {
    const resultado = await confirmarContratacionAccion({ ...VALIDOS, cuidadorId });

    expect(resultado).toEqual({ ok: false, mensaje: "Elige un cuidador para contratar." });
  });

  it("un cuidador que no existe devuelve un mensaje, no una excepción con detalles internos", async () => {
    const resultado = await confirmarContratacionAccion({ ...VALIDOS, cuidadorId: "no-existe" });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).not.toContain("no-existe");
    expect(resultado.mensaje).toMatch(/No pudimos confirmar/);
  });
});
