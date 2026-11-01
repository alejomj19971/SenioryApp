import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { validarLectura, validarMedicamento } from "@/lib/acciones/validar-teleasistencia";

describe("validarMedicamento", () => {
  const ok = { nombre: "Losartán", dosis: "50 mg", indicaciones: "", horarios: ["08:00"] };

  it("acepta un medicamento válido y ordena las horas", () => {
    const resultado = validarMedicamento({ ...ok, horarios: ["20:00", "08:00"], indicaciones: "  Con el desayuno " });

    expect(resultado).toEqual({
      datos: { nombre: "Losartán", dosis: "50 mg", indicaciones: "Con el desayuno", horarios: ["08:00", "20:00"] },
      valores: expect.any(Object),
    });
  });

  it("pide nombre, dosis y al menos una hora", () => {
    const resultado = validarMedicamento({ nombre: "  ", dosis: "", indicaciones: "", horarios: ["", " "] });

    expect(resultado).toHaveProperty("errores");
    expect(Object.keys((resultado as { errores: object }).errores).sort()).toEqual(["dosis", "horarios", "nombre"]);
  });

  it.each([["25:00"], ["8:00"], ["08:60"], ["ocho"], ["08:00:00"]])("rechaza la hora «%s»", (hora) => {
    expect(validarMedicamento({ ...ok, horarios: [hora] })).toHaveProperty("errores.horarios");
  });

  it("rechaza horas repetidas y más de 8", () => {
    expect(validarMedicamento({ ...ok, horarios: ["08:00", "08:00"] })).toHaveProperty("errores.horarios", "Hay horas repetidas.");
    const nueve = Array.from({ length: 9 }, (_, i) => `0${i + 1}:00`);
    expect(validarMedicamento({ ...ok, horarios: nueve })).toHaveProperty("errores.horarios", "Máximo 8 horas al día.");
  });

  it("conserva lo escrito para no hacer repetir", () => {
    const resultado = validarMedicamento({ ...ok, nombre: "", horarios: ["08:00", "20:00"] });

    expect((resultado as { valores: Record<string, string> }).valores).toMatchObject({ dosis: "50 mg", horarios: "08:00,20:00" });
  });

  it("rechaza textos demasiado largos", () => {
    expect(validarMedicamento({ ...ok, nombre: "x".repeat(401) })).toHaveProperty("errores.nombre");
    expect(validarMedicamento({ ...ok, indicaciones: "x".repeat(2001) })).toHaveProperty("errores.indicaciones");
  });
});

describe("validarLectura", () => {
  const vacia = { presionSistolica: "", presionDiastolica: "", frecuenciaCardiaca: "", glucosa: "" };

  it("acepta cualquier medida suelta (la glucosa sola es válida)", () => {
    expect(validarLectura({ ...vacia, glucosa: "95" })).toMatchObject({ datos: { glucosa: 95 } });
    expect(validarLectura({ ...vacia, frecuenciaCardiaca: "71" })).toMatchObject({ datos: { frecuenciaCardiaca: 71 } });
  });

  it("la presión va completa: las dos o ninguna", () => {
    expect(validarLectura({ ...vacia, presionSistolica: "120" })).toHaveProperty("errores.presionDiastolica");
    expect(validarLectura({ ...vacia, presionDiastolica: "80" })).toHaveProperty("errores.presionSistolica");
    expect(validarLectura({ ...vacia, presionSistolica: "120", presionDiastolica: "80" })).toMatchObject({ datos: { presionSistolica: 120, presionDiastolica: 80 } });
  });

  it("sin ninguna medida, lo dice", () => {
    expect(validarLectura(vacia)).toHaveProperty("errores.medidas", "Escribe al menos una medida.");
  });

  it.each(["abc", "12.5", "-3", "1e3", "12345", "9 5"])("rechaza «%s» como número", (valor) => {
    expect(validarLectura({ ...vacia, glucosa: valor })).toHaveProperty("errores.glucosa");
  });

  it("solo envía las medidas escritas", () => {
    const resultado = validarLectura({ ...vacia, presionSistolica: " 123 ", presionDiastolica: "77", glucosa: "95" });

    expect((resultado as { datos: object }).datos).toEqual({ presionSistolica: 123, presionDiastolica: 77, glucosa: 95 });
  });
});

// ── El servicio ───────────────────────────────────────────────────────────────────────────────────────────────────
const leerDelBackend = vi.fn();
const escribirEnBackend = vi.fn();
vi.mock("@/lib/api/cliente-servidor", () => ({ leerDelBackend, escribirEnBackend }));
const exigirFamiliaLista = vi.fn();
vi.mock("@/lib/services/paciente", () => ({ exigirFamiliaLista }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const servicio = await import("@/lib/services/teleasistencia");

const PERSONA = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const UUID_A = "01a19299-ec3b-7012-b94b-a8cebad258d4";
const UUID_B = "01a19299-ec3b-7012-b94b-a8cebad258d5";

beforeEach(() => {
  leerDelBackend.mockReset();
  escribirEnBackend.mockReset();
  exigirFamiliaLista.mockReset();
  exigirFamiliaLista.mockResolvedValue({ persona: { id: PERSONA } });
});

describe("servicio de teleasistencia", () => {
  it("las tomas de todos los medicamentos salen en UNA lista ordenada por hora, con el medicamento a que pertenecen", async () => {
    leerDelBackend.mockResolvedValue({
      fecha: "2026-11-01",
      medicamentos: [
        { id: "m1", nombre: "Losartán", dosis: "50 mg", indicaciones: "Con el desayuno", horarios: ["08:00", "20:00"], diasDeLaSemana: [1], vigenteDesde: "2026-11-01", vigenteHasta: null,
          tomas: [{ id: "t1", horaProgramada: "08:00", estado: "tomada", registradaEn: "x" }, { id: "t2", horaProgramada: "20:00", estado: "pendiente", registradaEn: null }] },
        { id: "m2", nombre: "Calcio", dosis: "1 tableta", indicaciones: null, horarios: ["13:00"], diasDeLaSemana: [1], vigenteDesde: "2026-11-01", vigenteHasta: null,
          tomas: [{ id: "t3", horaProgramada: "13:00", estado: "omitida", registradaEn: null }] },
      ],
    });

    const dia = await servicio.listarMedicamentosDeHoy();

    expect(leerDelBackend).toHaveBeenCalledWith(`/adultos-mayores/${PERSONA}/medicamentos`);
    expect(dia.tomas.map((t) => [t.hora, t.nombre, t.estado])).toEqual([
      ["08:00", "Losartán", "tomada"],
      ["13:00", "Calcio", "omitida"],
      ["20:00", "Losartán", "pendiente"],
    ]);
    expect(dia.tomas[0]).toMatchObject({ tomaId: "t1", medicamentoId: "m1", indicaciones: "Con el desayuno" });
    expect(dia.tomas[1]?.indicaciones).toBe("");
    expect(dia.medicamentos.map((m) => m.nombre)).toEqual(["Losartán", "Calcio"]);
  });

  it("la persona sale de la SESIÓN, nunca de un parámetro", async () => {
    leerDelBackend.mockResolvedValue({ lecturas: [] });

    await servicio.listarLecturas(7);

    expect(exigirFamiliaLista).toHaveBeenCalled();
    expect(leerDelBackend).toHaveBeenCalledWith(`/adultos-mayores/${PERSONA}/signos-vitales`, { consulta: { dias: "7" } });
  });

  it("las lecturas llegan de la más antigua a la más reciente y con medidas nulas intactas", async () => {
    leerDelBackend.mockResolvedValue({
      lecturas: [
        { id: "b", tomadaEn: "2026-11-01T15:00:00.000Z", presionSistolica: null, presionDiastolica: null, frecuenciaCardiaca: null, glucosa: 400, fueraDeRango: true, fuente: "manual" },
        { id: "a", tomadaEn: "2026-10-30T15:00:00.000Z", presionSistolica: 120, presionDiastolica: 80, frecuenciaCardiaca: 70, glucosa: null, fueraDeRango: false, fuente: "manual" },
      ],
    });

    const lecturas = await servicio.listarLecturas();

    expect(lecturas.map((l) => l.id)).toEqual(["a", "b"]);
    expect(lecturas[1]).toMatchObject({ presionSistolica: null, glucosa: 400, fueraDeRango: true });
    expect(JSON.stringify(lecturas)).not.toContain("fuente");
  });

  it("sin lecturas, la última es null (no un error)", async () => {
    leerDelBackend.mockResolvedValue({ lectura: null });

    expect(await servicio.obtenerUltimaLectura()).toBeNull();
  });

  it("el resumen mapea las tomas, la próxima y las alertas", async () => {
    leerDelBackend.mockResolvedValue({
      resumen: { fecha: "2026-11-01", tomasDeHoy: { total: 3, tomadas: 1, pendientes: 2, omitidas: 0 }, proximaToma: { medicamentoId: "m1", nombre: "Losartán", horaProgramada: "20:00" }, ultimaLectura: { tomadaEn: "2026-11-01T15:00:00.000Z", fueraDeRango: true }, alertasSinAtender: 2 },
    });

    expect(await servicio.obtenerResumen()).toEqual({
      fecha: "2026-11-01",
      tomas: { total: 3, tomadas: 1, pendientes: 2, omitidas: 0 },
      proximaToma: { nombre: "Losartán", hora: "20:00" },
      ultimaLectura: { fecha: "2026-11-01T15:00:00.000Z", fueraDeRango: true },
      alertasSinAtender: 2,
    });
  });

  it("la alerta manda la Idempotency-Key y el origen, y devuelve A QUIÉN se avisó", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { alerta: { id: "al1", origen: "boton", estado: "generada", generadaEn: "2026-11-01T15:00:00.000Z", primeraEntregaEn: null, atendidaEn: null, nota: null, avisadosA: ["Andrea", "Marta"] } } });

    const resultado = await servicio.enviarAlerta("boton", "clave-1234");

    expect(escribirEnBackend).toHaveBeenCalledWith(`/adultos-mayores/${PERSONA}/alertas`, { metodo: "POST", claveDeIdempotencia: "clave-1234", cuerpo: { origen: "boton" } });
    expect(resultado).toEqual({ ok: true, datos: { id: "al1", generadaEn: "2026-11-01T15:00:00.000Z", avisadosA: ["Andrea", "Marta"] } });
  });

  it("registrar un medicamento manda solo lo que el backend admite", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { medicamento: {} } });

    await servicio.registrarMedicamento({ nombre: "Calcio", dosis: "1", indicaciones: "", horarios: ["21:00"] });

    expect(escribirEnBackend).toHaveBeenCalledWith(`/adultos-mayores/${PERSONA}/medicamentos`, { metodo: "POST", cuerpo: { nombre: "Calcio", dosis: "1", horarios: ["21:00"] } });
  });

  it("marcar una toma manda el estado pedido", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { toma: {} } });

    await servicio.cambiarToma(UUID_A, UUID_B, "tomada");

    expect(escribirEnBackend).toHaveBeenCalledWith(`/medicamentos/${UUID_A}/tomas/${UUID_B}`, { metodo: "PATCH", cuerpo: { estado: "tomada" } });
  });
});

// ── Las acciones ──────────────────────────────────────────────────────────────────────────────────────────────────
const acciones = await import("@/lib/acciones/teleasistencia");
const formulario = (campos: [string, string][]) => {
  const datos = new FormData();
  for (const [nombre, valor] of campos) datos.append(nombre, valor);
  return datos;
};

describe("acciones de teleasistencia", () => {
  it("marcar una toma valida los ids y el estado antes de ir al backend", async () => {
    expect((await acciones.marcarTomaAccion("no-uuid", UUID_B, "tomada")).ok).toBe(false);
    expect((await acciones.marcarTomaAccion(UUID_A, UUID_B, "omitida")).ok).toBe(false);
    expect((await acciones.marcarTomaAccion(UUID_A, UUID_B, "borrar")).ok).toBe(false);
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("un choque de dos pantallas (409) se explica y no se presenta como falla", async () => {
    escribirEnBackend.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 409, codigo: "toma.no_pendiente", mensaje: "x" }) });

    const resultado = await acciones.marcarTomaAccion(UUID_A, UUID_B, "tomada");

    expect(resultado).toEqual({ ok: false, mensaje: expect.stringContaining("otra pantalla") });
  });

  it("marcar una toma de otro día se explica", async () => {
    escribirEnBackend.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 422, codigo: "toma.fuera_de_dia", mensaje: "x" }) });

    expect(await acciones.marcarTomaAccion(UUID_A, UUID_B, "tomada")).toEqual({ ok: false, mensaje: expect.stringContaining("otro día") });
  });

  it("agregar un medicamento valida sin ir al backend y devuelve lo escrito", async () => {
    const estado = await acciones.registrarMedicamentoAccion({}, formulario([["nombre", ""], ["dosis", "1"], ["horario", "08:00"]]));

    expect(estado.errores?.nombre).toBeDefined();
    expect(estado.valores?.dosis).toBe("1");
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("agregar un medicamento válido envía todas las horas del formulario", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { medicamento: {} } });

    const estado = await acciones.registrarMedicamentoAccion({}, formulario([["nombre", "Losartán"], ["dosis", "50 mg"], ["horario", "20:00"], ["horario", "08:00"]]));

    expect(estado).toEqual({ listo: true });
    expect(escribirEnBackend.mock.calls[0]?.[1]).toMatchObject({ cuerpo: { nombre: "Losartán", horarios: ["08:00", "20:00"] } });
  });

  it("una lectura con un valor imposible se explica con el texto del backend, sin perder lo escrito", async () => {
    escribirEnBackend.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 400, codigo: "lectura.valor_implausible", mensaje: "Ese valor no parece posible" }) });

    const estado = await acciones.registrarLecturaAccion({}, formulario([["frecuenciaCardiaca", "5000"]]));

    expect(estado.mensaje).toBe("Ese valor no parece posible");
    expect(estado.valores?.frecuenciaCardiaca).toBe("5000");
  });

  it("la alerta solo acepta los orígenes conocidos y una clave razonable, y devuelve a quién se avisó", async () => {
    expect((await acciones.enviarAlertaAccion("magia", "clave-1234")).ok).toBe(false);
    expect((await acciones.enviarAlertaAccion("boton", "x")).ok).toBe(false);
    expect(escribirEnBackend).not.toHaveBeenCalled();

    escribirEnBackend.mockResolvedValue({ ok: true, datos: { alerta: { id: "al1", origen: "voz", estado: "generada", generadaEn: "2026-11-01T15:00:00.000Z", primeraEntregaEn: null, atendidaEn: null, nota: null, avisadosA: ["Andrea"] } } });
    expect(await acciones.enviarAlertaAccion("voz", "clave-1234")).toEqual({ ok: true, alerta: { id: "al1", generadaEn: "2026-11-01T15:00:00.000Z", avisadosA: ["Andrea"] } });
  });

  it("si la alerta falla, lo dice (no finge que se avisó)", async () => {
    escribirEnBackend.mockResolvedValue({ ok: false, error: ErrorDeApi.deRed(new TypeError("fetch failed")) });

    const resultado = await acciones.enviarAlertaAccion("boton", "clave-1234");

    expect(resultado).toEqual({ ok: false, mensaje: expect.stringContaining("No pudimos conectar") });
  });

  it("dejar de tomar valida el id", async () => {
    expect((await acciones.desactivarMedicamentoAccion("no-uuid")).ok).toBe(false);
    escribirEnBackend.mockResolvedValue({ ok: true, datos: undefined });
    expect(await acciones.desactivarMedicamentoAccion(UUID_A)).toEqual({ ok: true });
  });
});
