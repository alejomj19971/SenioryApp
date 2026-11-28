import { describe, expect, it } from "vitest";
import { describirProximaDisponibilidad, proximaDisponibilidad } from "@/lib/disponibilidad";
import type { RangoLibre } from "@/lib/types";

// El sábado 28 de noviembre de 2026 (día 6 de la semana ISO); el domingo es 7 y el lunes 1.
const SABADO = "2026-11-28";
const rango = (diaSemana: number, desdeHora: number, hastaHora: number): RangoLibre => ({
  diaSemana,
  horaInicio: desdeHora * 60,
  horaFin: hastaHora * 60,
});
const ahora = (minutos: number) => ({ hoy: SABADO, minutos });

describe("proximaDisponibilidad", () => {
  it("si hoy le quedan horas, es hoy mismo, desde la primera que no ha pasado", () => {
    // Sábado de 8 a. m. a 6 p. m.; son las 2:10 p. m. → la primera hora pedible es la de las 2:30 p. m.
    const proxima = proximaDisponibilidad([rango(6, 8, 18)], ahora(14 * 60 + 10));

    expect(proxima).toEqual({ fecha: SABADO, horaInicio: 14 * 60 + 30 });
  });

  it("si hoy ya no le quedan, salta al primer día con horas", () => {
    // Solo trabaja los lunes (1): del sábado al lunes 30.
    const proxima = proximaDisponibilidad([rango(1, 6, 12)], ahora(10 * 60));

    expect(proxima).toEqual({ fecha: "2026-11-30", horaInicio: 6 * 60 });
  });

  it("hoy ya pasó su horario: la próxima es mañana", () => {
    const proxima = proximaDisponibilidad([rango(6, 8, 12), rango(7, 9, 12)], ahora(15 * 60));

    expect(proxima).toEqual({ fecha: "2026-11-29", horaInicio: 9 * 60 });
  });

  it("pidiendo más horas, solo cuentan los días en que caben de corrido", () => {
    // Sábado: 1 hora libre (8 a 9). Domingo: 4 horas libres. Para 3 horas hay que esperar al domingo.
    const horarios = [rango(6, 8, 9), rango(7, 8, 12)];

    expect(proximaDisponibilidad(horarios, ahora(7 * 60), 1)?.fecha).toBe(SABADO);
    expect(proximaDisponibilidad(horarios, ahora(7 * 60), 3)?.fecha).toBe("2026-11-29");
  });

  it("puede buscar desde otro día (el que la familia está mirando)", () => {
    const proxima = proximaDisponibilidad([rango(6, 8, 18), rango(1, 7, 10)], ahora(9 * 60), 1, "2026-11-29");

    expect(proxima).toEqual({ fecha: "2026-11-30", horaInicio: 7 * 60 });
  });

  it("sin horario, o sin horas en las próximas dos semanas, no hay disponibilidad", () => {
    expect(proximaDisponibilidad([], ahora(9 * 60))).toBeNull();
  });
});

describe("describirProximaDisponibilidad", () => {
  it("hoy: lo dice y lo marca para resaltarlo", () => {
    const descripcion = describirProximaDisponibilidad({ fecha: SABADO, horaInicio: 18 * 60 + 30 }, SABADO);

    expect(descripcion).toEqual({ texto: "Disponible hoy desde las 6:30 p. m.", hoy: true });
  });

  it("mañana", () => {
    const descripcion = describirProximaDisponibilidad({ fecha: "2026-11-29", horaInicio: 6 * 60 }, SABADO);

    expect(descripcion).toEqual({ texto: "Disponible mañana desde las 6:00 a. m.", hoy: false });
  });

  it("más adelante: con el día de la semana y la fecha, sin coma", () => {
    const descripcion = describirProximaDisponibilidad({ fecha: "2026-11-30", horaInicio: 9 * 60 }, SABADO);

    expect(descripcion).toEqual({ texto: "Disponible el lunes 30 de noviembre desde las 9:00 a. m.", hoy: false });
  });

  it("sin disponibilidad, lo dice claro", () => {
    expect(describirProximaDisponibilidad(null, SABADO)).toEqual({ texto: "Sin horas disponibles por ahora", hoy: false });
  });
});
