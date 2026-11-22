import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { mensajeDeErrorDeServicio } from "@/lib/acciones/errores-de-servicio";
import { ahoraEnColombia, horaEnColombia, horaYaPaso, horasPedibles, jornadaDe, sumarDias } from "@/lib/fecha-colombia";
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

  describe("horas de inicio (las mismas reglas del backend)", () => {
    const aLas = (hora: number, minuto = 0) => ({ hoy: "2026-11-01", minutos: hora * 60 + minuto });
    // Mañana y tarde fusionadas (360–1080), los 7 días: el mismo horario, sin importar el día de la semana.
    const MANANA_Y_TARDE = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({ diaSemana, horaInicio: 360, horaFin: 1_080 }));

    it("jornadaDe clasifica la hora de inicio (solo para la disponibilidad general del cuidador)", () => {
      expect(jornadaDe(0)).toBe("noche");
      expect(jornadaDe(359)).toBe("noche");
      expect(jornadaDe(360)).toBe("manana");
      expect(jornadaDe(719)).toBe("manana");
      expect(jornadaDe(720)).toBe("tarde");
      expect(jornadaDe(1079)).toBe("tarde");
      expect(jornadaDe(1080)).toBe("noche");
    });

    it("a las 8 p. m., las horas de la mañana y la tarde ya pasaron; una de la noche más tarde, no", () => {
      expect(horaYaPaso("2026-11-01", 360, aLas(20))).toBe(true); // 6:00 a. m.
      expect(horaYaPaso("2026-11-01", 720, aLas(20))).toBe(true); // 12:00 p. m.
      expect(horaYaPaso("2026-11-01", 1320, aLas(20))).toBe(false); // 10:00 p. m.
    });

    it("el límite es exacto: a las 6:00 en punto esa hora ya pasó; un minuto antes, no", () => {
      expect(horaYaPaso("2026-11-01", 360, aLas(5, 59))).toBe(false);
      expect(horaYaPaso("2026-11-01", 360, aLas(6, 0))).toBe(true);
    });

    it("un día futuro nunca pasó y uno pasado siempre", () => {
      expect(horaYaPaso("2026-11-02", 360, aLas(23))).toBe(false);
      expect(horaYaPaso("2026-10-31", 1320, aLas(0))).toBe(true);
    });

    it("solo ofrece horas del horario del cuidador que no han pasado", () => {
      const horas = horasPedibles("2026-11-01", MANANA_Y_TARDE, aLas(14), 1);
      expect(horas.every((h) => h > 840)).toBe(true); // nada antes de (ni en) las 2 p. m., que es ahora
      expect(horas.every((h) => h < 1080)).toBe(true); // nada de la noche: no está en el horario
      expect(horas).toContain(870); // las 2:30 p. m. (la próxima media hora) sí se puede
      expect(horas).not.toContain(840); // las 2 p. m., que es ahora mismo, ya se considera pasada
      expect(horas).not.toContain(360); // las 6 a. m. ya pasó
    });

    it("sin ninguna hora disponible ese día, no ofrece nada", () => {
      expect(horasPedibles("2026-11-01", MANANA_Y_TARDE, aLas(19), 1)).toEqual([]);
    });

    it("una duración que no cabe en el rango libre no se ofrece, aunque el inicio sí esté dentro", () => {
      // Mañana y tarde van de 360 a 1080: a las 1050 (5:30 p. m.) solo caben 30 minutos, no una hora.
      expect(horasPedibles("2026-11-01", MANANA_Y_TARDE, aLas(0), 1)).not.toContain(1_050);
      expect(horasPedibles("2026-11-01", MANANA_Y_TARDE, aLas(0), 1)).toContain(1_020);
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
  horaInicio: 720,
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

    await servicios.solicitarServicio("a1", { cuidadorId: UUID, fecha: "2026-11-10", horaInicio: 720, horas: 2, medioDePago: "bolsa" }, "clave-1234");

    expect(escribirEnBackend).toHaveBeenCalledWith("/servicios", {
      metodo: "POST",
      claveDeIdempotencia: "clave-1234",
      cuerpo: { adultoMayorId: "a1", cuidadorId: UUID, fecha: "2026-11-10", horaInicio: 720, horas: 2, medioDePago: "bolsa" },
    });
  });

  it("un error del backend pasa como valor (no se lanza)", async () => {
    const falla = { ok: false, error: new ErrorDeApi({ estado: 409, codigo: "servicio.franja_ocupada", mensaje: "ocupada" }) };
    escribirEnBackend.mockResolvedValue(falla);

    expect(await servicios.solicitarServicio("a1", { cuidadorId: UUID, fecha: "2026-11-10", horaInicio: 720, horas: 1, medioDePago: "pasarela" }, "clave-1234")).toEqual(falla);
  });

  it("los cuidadores en turno traen el teléfono SOLO por aquí, y un arreglo vacío si no hay ninguno", async () => {
    leerDelBackend.mockResolvedValueOnce({ cuidadoresEnTurno: [] });
    expect(await servicios.obtenerCuidadoresEnTurnoDe("a1")).toEqual([]);

    leerDelBackend.mockResolvedValueOnce({
      cuidadoresEnTurno: [
        {
          servicio: vistaBasica({ subtotal: 1, cargoDeServicio: 0, totalFamilia: 1 }),
          cuidador: { id: "c1", nombre: "Marta Elena", telefono: "+573001234567", fotoUrl: null, especialidad: "enfermeria" },
        },
      ],
    });
    expect(await servicios.obtenerCuidadoresEnTurnoDe("a1")).toEqual([
      {
        id: "c1",
        nombre: "Marta Elena",
        foto: "",
        especialidad: "enfermeria",
        telefono: "+573001234567",
        servicioId: UUID,
      },
    ]);
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

const SOLICITUD = { cuidadorId: UUID, fecha: "2026-11-10", horaInicio: 720, horas: 2, medioDePago: "pasarela" };

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
    [{ ...SOLICITUD, horaInicio: 361 }, "hora de inicio válida"],
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

  const MODIFICACION = { fecha: "2026-11-10", horaInicio: 720, horas: 3 };

  it.each([
    ["no-uuid", MODIFICACION, "No encontramos ese servicio"],
    [UUID, { ...MODIFICACION, horas: 0 }, "entre 1 y 8"],
    [UUID, { ...MODIFICACION, horaInicio: 361 }, "hora de inicio válida"],
    [UUID, { ...MODIFICACION, fecha: "2026-02-30" }, "fecha válida"],
    [UUID, null, "entre 1 y 8"],
  ])("rechaza una modificación inválida sin ir al backend", async (id, datos, mensaje) => {
    const resultado = await acciones.modificarServicioAccion(id, datos);

    expect(resultado).toMatchObject({ ok: false });
    expect(JSON.stringify(resultado)).toContain(mensaje);
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("modifica y revalida las pantallas de ese servicio", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { servicio: vistaBasica({ horaInicio: 720, horas: 3 }) } });

    const resultado = await acciones.modificarServicioAccion(UUID, MODIFICACION);

    expect(resultado).toEqual({ ok: true });
    expect(escribirEnBackend).toHaveBeenCalledWith(`/servicios/${UUID}/modificar`, { metodo: "POST", cuerpo: MODIFICACION });
  });

  it("traduce un conflicto de horario del backend a un mensaje claro", async () => {
    escribirEnBackend.mockResolvedValue({
      ok: false,
      error: new ErrorDeApi({ estado: 409, codigo: "servicio.franja_ocupada", mensaje: "ocupada" }),
    });

    const resultado = await acciones.modificarServicioAccion(UUID, MODIFICACION);

    expect(resultado).toEqual({ ok: false, mensaje: expect.stringContaining("ya tiene un servicio en ese horario") });
  });
});
