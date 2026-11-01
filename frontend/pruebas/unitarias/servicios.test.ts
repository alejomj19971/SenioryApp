import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { mensajeDeErrorDeServicio } from "@/lib/acciones/errores-de-servicio";
import { ahoraEnColombia, franjaYaTermino, franjasPedibles, horaEnColombia, sumarDias } from "@/lib/fecha-colombia";
import { etiquetaDeEstadoParaElCuidador, etiquetaDeEstadoParaLaFamilia } from "@/lib/etiquetas-de-servicio";
import { formatearDiaCivil } from "@/lib/format";

describe("la fecha de Colombia (H2: nunca un instante UTC)", () => {
  it("a las 8 p. m. de Medellín ya es «mañana» en UTC, pero «hoy» sigue siendo el de Colombia", () => {
    // 2026-11-02 01:00 UTC = 2026-11-01 20:00 en Colombia (UTC−5, sin horario de verano)
    const ahora = ahoraEnColombia(new Date("2026-11-02T01:00:00Z"));

    expect(ahora).toEqual({ hoy: "2026-11-01", minutos: 20 * 60 });
  });

  it("después de la medianoche de Colombia cambia el día", () => {
    expect(ahoraEnColombia(new Date("2026-11-02T05:00:00Z"))).toEqual({ hoy: "2026-11-02", minutos: 0 });
    expect(ahoraEnColombia(new Date("2026-11-02T04:59:00Z"))).toEqual({ hoy: "2026-11-01", minutos: 23 * 60 + 59 });
  });

  it("sumarDias cruza meses, años y años bisiestos sin depender de la zona del equipo", () => {
    expect(sumarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2027-02-28", 1)).toBe("2027-03-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  describe("franjas que ya terminaron (las mismas reglas del backend)", () => {
    const aLas = (hora: number, minuto = 0) => ({ hoy: "2026-11-01", minutos: hora * 60 + minuto });

    it("a las 8 p. m. la tarde de hoy terminó, pero la noche no", () => {
      expect(franjaYaTermino("2026-11-01", "manana", aLas(20))).toBe(true);
      expect(franjaYaTermino("2026-11-01", "tarde", aLas(20))).toBe(true);
      expect(franjaYaTermino("2026-11-01", "noche", aLas(20))).toBe(false);
    });

    it("el límite es exacto: la mañana termina a las 12:00 en punto", () => {
      expect(franjaYaTermino("2026-11-01", "manana", aLas(11, 59))).toBe(false);
      expect(franjaYaTermino("2026-11-01", "manana", aLas(12))).toBe(true);
    });

    it("la noche de hoy dura hasta las 6 a. m. de mañana: a las 11:59 p. m. todavía no termina", () => {
      expect(franjaYaTermino("2026-11-01", "noche", aLas(23, 59))).toBe(false);
    });

    it("un día futuro nunca terminó y uno pasado siempre", () => {
      expect(franjaYaTermino("2026-11-02", "manana", aLas(23))).toBe(false);
      expect(franjaYaTermino("2026-10-31", "noche", aLas(0))).toBe(true);
    });

    it("solo se ofrecen las franjas que el cuidador atiende y que no terminaron", () => {
      expect(franjasPedibles("2026-11-01", ["manana", "tarde", "noche"], aLas(14))).toEqual(["tarde", "noche"]);
      expect(franjasPedibles("2026-11-01", ["manana", "tarde"], aLas(19))).toEqual([]);
      expect(franjasPedibles("2026-11-02", ["manana", "noche"], aLas(19))).toEqual(["manana", "noche"]);
    });
  });

  it("horaEnColombia muestra la hora de Colombia sin importar dónde corra", () => {
    expect(horaEnColombia("2026-11-02T01:30:00Z")).toBe("20:30");
  });

  it("un día civil se escribe como ese día, no corrido por la zona horaria", () => {
    expect(formatearDiaCivil("2026-11-01")).toBe("domingo, 1 de noviembre");
    expect(formatearDiaCivil("2026-03-01")).toMatch(/^domingo, 1 de marzo$/);
  });
});

describe("estados y mensajes", () => {
  it("cada estado tiene su etiqueta, con un texto que no es solo el color", () => {
    const estados = ["solicitado", "aceptado", "en_curso", "finalizado", "cancelado"] as const;
    for (const estado of estados) {
      expect(etiquetaDeEstadoParaLaFamilia(estado, null).texto).not.toBe("");
      expect(etiquetaDeEstadoParaElCuidador(estado, null).texto).not.toBe("");
    }
  });

  it("a la familia se le aclara que una solicitud sin respuesta no cuesta nada", () => {
    expect(etiquetaDeEstadoParaLaFamilia("cancelado", "expirada").explicacion).toContain("No se te cobró nada");
    expect(etiquetaDeEstadoParaLaFamilia("cancelado", "rechazada").explicacion).toContain("No se te cobró nada");
    expect(etiquetaDeEstadoParaLaFamilia("solicitado", null).explicacion).toContain("no se cobra nada");
  });

  it("al cuidador nunca se le habla de lo que paga la familia", () => {
    for (const estado of ["solicitado", "aceptado", "en_curso", "finalizado", "cancelado"] as const) {
      expect(JSON.stringify(etiquetaDeEstadoParaElCuidador(estado, null))).not.toMatch(/cobr|pag[aó] la familia|total/i);
    }
  });

  const error = (estado: number, codigo: string, mensaje = "Mensaje del backend") => new ErrorDeApi({ estado, codigo, mensaje });

  it.each([
    ["servicio.franja_ocupada", /ya tiene un servicio en ese horario/],
    ["bolsa.saldo_insuficiente", /bolsa no alcanza/],
    ["servicio.franja_terminada", /ya terminó/],
    ["servicio.sin_consentimiento", /autorización/],
    ["servicio.pago_pendiente", /pago aprobado/],
  ])("el código %s se explica con palabras claras", (codigo, esperado) => {
    expect(mensajeDeErrorDeServicio(error(409, codigo))).toMatch(esperado);
  });

  it("demasiadas solicitudes (429), no encontrado (404) y lo demás con el texto del backend", () => {
    expect(mensajeDeErrorDeServicio(error(429, "demasiadas_peticiones"))).toContain("demasiadas solicitudes");
    expect(mensajeDeErrorDeServicio(error(404, "no_encontrado"))).toBe("No encontramos ese servicio.");
    expect(mensajeDeErrorDeServicio(error(422, "otro.codigo", "Texto en español"))).toBe("Texto en español");
  });
});

// ── El servicio: mapea las dos vistas y NUNCA mezcla el dinero de una con la otra ───────────────────────────────────
const escribirEnBackend = vi.fn();
const leerDelBackend = vi.fn();
vi.mock("@/lib/api/cliente-servidor", () => ({ escribirEnBackend, leerDelBackend }));

const servicios = await import("@/lib/services/servicios");

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const vistaBasica = (extra: object = {}) => ({
  id: UUID,
  estado: "solicitado",
  fecha: "2026-11-10",
  jornada: "tarde",
  horas: 2,
  medioDePago: "pasarela",
  solicitudExpiraEn: "2026-11-01T22:00:00.000Z",
  cuidador: { id: "c1", nombre: "Marta Elena" },
  adultoMayor: { id: "a1", nombre: "Doña Carmen", edad: 78 },
  solicitadoEn: "2026-11-01T20:00:00.000Z",
  aceptadoEn: null,
  iniciadoEn: null,
  finalizadoEn: null,
  canceladoEn: null,
  motivoDeCancelacion: null,
  calificacion: null,
  tarifaHora: 20_000,
  ...extra,
});

beforeEach(() => {
  escribirEnBackend.mockReset();
  leerDelBackend.mockReset();
});

describe("servicios: la vista de la familia y la del cuidador", () => {
  it("la familia recibe lo que paga y NADA de lo que recibe el cuidador, aunque el backend lo mandara por error", async () => {
    leerDelBackend.mockResolvedValue({
      servicio: vistaBasica({ subtotal: 40_000, cargoDeServicio: 3_200, totalFamilia: 43_200, politicaVersion: 1, pagoProfesional: 36_000 }),
    });

    const servicio = await servicios.obtenerServicio(UUID);

    expect(servicio).toMatchObject({ subtotal: 40_000, cargoDeServicio: 3_200, totalFamilia: 43_200 });
    expect(JSON.stringify(servicio)).not.toContain("pagoProfesional");
    expect(JSON.stringify(servicio)).not.toContain("36000");
  });

  it("el cuidador recibe lo que recibe y NADA de lo que paga la familia", async () => {
    leerDelBackend.mockResolvedValue({
      servicios: [vistaBasica({ pagoProfesional: 36_000, totalFamilia: 43_200, cargoDeServicio: 3_200, subtotal: 40_000 })],
      siguiente: null,
    });

    const { servicios: lista } = await servicios.listarServiciosDelCuidador();

    expect(lista[0]).toMatchObject({ pagoProfesional: 36_000 });
    expect(JSON.stringify(lista)).not.toMatch(/totalFamilia|cargoDeServicio|subtotal|43200/);
  });

  it("el comentario nulo de una calificación queda vacío", async () => {
    leerDelBackend.mockResolvedValue({
      servicio: vistaBasica({ estado: "finalizado", subtotal: 1, cargoDeServicio: 0, totalFamilia: 1, calificacion: { calificacion: 5, comentario: null } }),
    });

    expect((await servicios.obtenerServicio(UUID))?.calificacion).toEqual({ calificacion: 5, comentario: "" });
  });

  it("un id que no es UUID no llega al backend: es «no encontrado»", async () => {
    expect(await servicios.obtenerServicio("no-es-uuid")).toBeNull();
    expect(leerDelBackend).not.toHaveBeenCalled();
  });

  it("solicitar manda la Idempotency-Key, la persona y los datos, y NINGÚN monto", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { servicio: vistaBasica({ subtotal: 1, cargoDeServicio: 0, totalFamilia: 1 }) } });

    await servicios.solicitarServicio("a1", { cuidadorId: UUID, fecha: "2026-11-10", jornada: "tarde", horas: 2, medioDePago: "bolsa" }, "clave-1234");

    expect(escribirEnBackend).toHaveBeenCalledWith("/servicios", {
      metodo: "POST",
      claveDeIdempotencia: "clave-1234",
      cuerpo: { adultoMayorId: "a1", cuidadorId: UUID, fecha: "2026-11-10", jornada: "tarde", horas: 2, medioDePago: "bolsa" },
    });
  });

  it("un error del backend pasa como valor (no se lanza)", async () => {
    const falla = { ok: false, error: new ErrorDeApi({ estado: 409, codigo: "servicio.franja_ocupada", mensaje: "ocupada" }) };
    escribirEnBackend.mockResolvedValue(falla);

    expect(await servicios.solicitarServicio("a1", { cuidadorId: UUID, fecha: "2026-11-10", jornada: "tarde", horas: 1, medioDePago: "pasarela" }, "clave-1234")).toEqual(falla);
  });

  it("el cuidador en turno trae el teléfono SOLO por aquí, y null si no hay", async () => {
    leerDelBackend.mockResolvedValueOnce({ cuidadorEnTurno: null });
    expect(await servicios.obtenerCuidadorEnTurnoDe("a1")).toBeNull();

    leerDelBackend.mockResolvedValueOnce({
      cuidadorEnTurno: {
        servicio: vistaBasica({ subtotal: 1, cargoDeServicio: 0, totalFamilia: 1 }),
        cuidador: { id: "c1", nombre: "Marta Elena", telefono: "+573001234567", fotoUrl: null, especialidad: "enfermeria" },
      },
    });
    expect(await servicios.obtenerCuidadorEnTurnoDe("a1")).toEqual({
      id: "c1",
      nombre: "Marta Elena",
      foto: "",
      especialidad: "enfermeria",
      telefono: "+573001234567",
      servicioId: UUID,
    });
  });

  it("cotizar mapea el porcentaje y el monto del cargo", async () => {
    escribirEnBackend.mockResolvedValue({
      ok: true,
      datos: { cotizacion: { cuidadorId: UUID, horas: 3, tarifaHora: 20_000, subtotal: 60_000, cargoDeServicio: { porcentaje: 8, monto: 4_800 }, totalFamilia: 64_800, politicaVersion: 1 } },
    });

    const resultado = await servicios.cotizar(UUID, 3);

    expect(resultado).toEqual({
      ok: true,
      datos: { cuidadorId: UUID, horas: 3, tarifaHora: 20_000, subtotal: 60_000, cargoPorcentaje: 8, cargo: 4_800, totalFamilia: 64_800 },
    });
  });
});

// ── Las acciones ──────────────────────────────────────────────────────────────────────────────────────────────────
const exigirFamiliaLista = vi.fn();
vi.mock("@/lib/services/paciente", () => ({ exigirFamiliaLista }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const acciones = await import("@/lib/acciones/servicios");

const SOLICITUD = { cuidadorId: UUID, fecha: "2026-11-10", jornada: "tarde", horas: 2, medioDePago: "pasarela" };

describe("acciones de servicios", () => {
  beforeEach(() => {
    exigirFamiliaLista.mockReset();
    exigirFamiliaLista.mockResolvedValue({ persona: { id: "persona-de-la-sesion" } });
  });

  it.each([
    [{ ...SOLICITUD, cuidadorId: "no-uuid" }, "Elige un cuidador"],
    [{ ...SOLICITUD, horas: 0 }, "entre 1 y 8"],
    [{ ...SOLICITUD, horas: 9 }, "entre 1 y 8"],
    [{ ...SOLICITUD, horas: 1.5 }, "entre 1 y 8"],
    [{ ...SOLICITUD, jornada: "madrugada" }, "Elige una franja"],
    [{ ...SOLICITUD, fecha: "2026-02-30" }, "fecha válida"],
    [{ ...SOLICITUD, fecha: "mañana" }, "fecha válida"],
    [{ ...SOLICITUD, medioDePago: "efectivo" }, "cómo vas a pagar"],
    [null, "Elige un cuidador"],
  ])("rechaza una solicitud inválida (%j) sin ir al backend", async (datos, mensaje) => {
    const resultado = await acciones.solicitarServicioAccion(datos, "clave-1234");

    expect(resultado).toMatchObject({ ok: false });
    expect(JSON.stringify(resultado)).toContain(mensaje);
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("exige una clave de idempotencia razonable", async () => {
    for (const clave of [undefined, "", "corta", "x".repeat(101), 123]) {
      expect((await acciones.solicitarServicioAccion(SOLICITUD, clave)).ok).toBe(false);
    }
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("la persona a cuidar sale de la SESIÓN, aunque el formulario traiga otra", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { servicio: vistaBasica({ subtotal: 1, cargoDeServicio: 0, totalFamilia: 1 }) } });

    const resultado = await acciones.solicitarServicioAccion({ ...SOLICITUD, adultoMayorId: "de-otra-familia" }, "clave-1234");

    expect(resultado).toEqual({ ok: true, servicioId: UUID });
    expect(escribirEnBackend.mock.calls[0]?.[1]).toMatchObject({ cuerpo: { adultoMayorId: "persona-de-la-sesion" } });
    expect(JSON.stringify(escribirEnBackend.mock.calls[0])).not.toContain("de-otra-familia");
  });

  it("traduce un conflicto del backend a un mensaje claro", async () => {
    escribirEnBackend.mockResolvedValue({
      ok: false,
      error: new ErrorDeApi({ estado: 409, codigo: "servicio.franja_ocupada", mensaje: "ocupada" }),
    });

    const resultado = await acciones.solicitarServicioAccion(SOLICITUD, "clave-1234");

    expect(resultado).toEqual({ ok: false, mensaje: expect.stringContaining("ya tiene un servicio en ese horario") });
  });

  it("cotizar valida el cuidador y las horas antes de preguntar", async () => {
    expect((await acciones.cotizarServicio("x", 1)).ok).toBe(false);
    expect((await acciones.cotizarServicio(UUID, 12)).ok).toBe(false);
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("calificar exige un entero de 1 a 5 y un comentario de hasta 500 caracteres", async () => {
    for (const [estrellas, comentario] of [[0, ""], [6, ""], [3.5, ""], ["5", ""], [5, "x".repeat(501)]] as const) {
      expect((await acciones.calificarServicioAccion(UUID, estrellas, comentario)).ok).toBe(false);
    }
    escribirEnBackend.mockResolvedValue({ ok: true, datos: {} });
    expect(await acciones.calificarServicioAccion(UUID, 5, "Muy puntual")).toEqual({ ok: true });
    expect(escribirEnBackend).toHaveBeenCalledWith(`/servicios/${UUID}/calificacion`, { metodo: "POST", cuerpo: { calificacion: 5, comentario: "Muy puntual" } });
  });

  it("las acciones del cuidador solo admiten las cuatro conocidas", async () => {
    expect((await acciones.actuarServicioAccion(UUID, "borrar")).ok).toBe(false);
    expect((await acciones.actuarServicioAccion("no-uuid", "aceptar")).ok).toBe(false);
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { servicio: vistaBasica({ pagoProfesional: 1 }) } });
    expect(await acciones.actuarServicioAccion(UUID, "aceptar")).toEqual({ ok: true });
    expect(escribirEnBackend).toHaveBeenCalledWith(`/servicios/${UUID}/aceptar`, { metodo: "POST" });
  });
});
