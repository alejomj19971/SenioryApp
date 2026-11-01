import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { avisosNuevos, destinoDelAviso, esCursorValido, esFechaIso } from "@/lib/avisos";
import type { Aviso } from "@/lib/types";

const leerDelBackend = vi.fn();
vi.mock("@/lib/api/cliente-servidor", () => ({ leerDelBackend }));
const almacen = new Map<string, string>();
const fijar = vi.fn((nombre: string, valor: string) => almacen.set(nombre, valor));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (almacen.has(n) ? { value: almacen.get(n) } : undefined), set: fijar }),
}));

const cargarAvisosAccion = vi.fn();
vi.mock("@/lib/acciones/avisos", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/acciones/avisos")>()),
  cargarAvisosAccion,
}));

const servicio = await import("@/lib/services/notificaciones");
const acciones = await vi.importActual<typeof import("@/lib/acciones/avisos")>("@/lib/acciones/avisos");
const { ListaDeAvisos } = await import("@/components/avisos/lista-de-avisos");
const { Campana } = await import("@/components/avisos/campana");

const aviso = (id: string, creadaEn: string, extra: Partial<Aviso> = {}): Aviso => ({
  id,
  tipo: "servicio_confirmado:familia",
  titulo: `Aviso ${id}`,
  cuerpo: `Cuerpo ${id}`,
  prioridad: "normal",
  creadaEn,
  ...extra,
});

beforeEach(() => {
  leerDelBackend.mockReset();
  cargarAvisosAccion.mockReset();
  fijar.mockClear();
  almacen.clear();
});

describe("reglas de la campana", () => {
  it("lo «nuevo» es lo posterior a lo último que se vio en este dispositivo", () => {
    const a = [aviso("3", "2026-11-01T12:00:00.000Z"), aviso("2", "2026-11-01T11:00:00.000Z"), aviso("1", "2026-11-01T10:00:00.000Z")];

    expect(avisosNuevos(a, "2026-11-01T11:00:00.000Z").map((x) => x.id)).toEqual(["3"]);
    expect(avisosNuevos(a, "2026-11-01T12:00:00.000Z")).toEqual([]);
    expect(avisosNuevos(a, undefined)).toHaveLength(3);
    // Una cookie manipulada o dañada no esconde nada
    expect(avisosNuevos(a, "ayer")).toHaveLength(3);
  });

  it("valida fechas y cursores antes de usarlos", () => {
    expect(esFechaIso("2026-11-01T12:00:00.000Z")).toBe(true);
    expect(esFechaIso("2026-11-01")).toBe(false);
    expect(esFechaIso(5)).toBe(false);
    expect(esCursorValido("abc_DEF-123")).toBe(true);
    expect(esCursorValido("a b")).toBe(false);
    expect(esCursorValido("../x")).toBe(false);
    expect(esCursorValido("a".repeat(501))).toBe(false);
  });

  it.each([
    ["servicio_confirmado:familia", "/app", "/app/servicios"],
    ["servicio_solicitado:cuidador", "/cuidador", "/cuidador"],
    ["pago_requerido:familia", "/app", "/app/bolsa"],
    ["bolsa_comprada:familia", "/app", "/app/bolsa"],
    ["mensaje_nuevo:destinatario", "/app", "/app/mensajes"],
    ["mensaje_nuevo:destinatario", "/cuidador", "/cuidador/mensajes"],
    ["alerta_generada:destinatario", "/app", "/app/teleasistencia"],
    ["alerta_generada:destinatario", "/cuidador", null],
    ["cuidador_verificado:cuidador", "/cuidador", "/cuidador"],
    ["algo_nuevo:familia", "/app", null],
  ] as const)("el aviso «%s» en %s lleva a %s", (tipo, base, destino) => {
    expect(destinoDelAviso(tipo, base)).toBe(destino);
  });
});

describe("servicio de avisos", () => {
  it("lista blanca: solo la forma que la pantalla usa", async () => {
    leerDelBackend.mockResolvedValue({
      notificaciones: [{ ...aviso("1", "2026-11-01T10:00:00.000Z"), parametros: { nombre: "x" }, destinatarioId: "u1" }],
      siguiente: "c1",
    });

    const pagina = await servicio.listarAvisos();

    expect(Object.keys(pagina.avisos[0] as object).sort()).toEqual(["creadaEn", "cuerpo", "id", "prioridad", "tipo", "titulo"]);
    expect(pagina.siguiente).toBe("c1");
  });

  it("un cursor con forma rara no se reenvía", async () => {
    leerDelBackend.mockResolvedValue({ notificaciones: [], siguiente: null });

    await servicio.listarAvisos("a b/../c");

    expect(leerDelBackend.mock.calls[0]?.[1]).toEqual({ consulta: { limite: "20" } });
  });

  it("hay avisos nuevos según la cookie; y si el backend falla, simplemente no hay punto (no rompe la pantalla)", async () => {
    leerDelBackend.mockResolvedValue({ notificaciones: [aviso("1", "2026-11-01T10:00:00.000Z")], siguiente: null });
    expect(await servicio.hayAvisosNuevos()).toBe(true);

    almacen.set("seniory_avisos_vistos", "2026-11-01T10:00:00.000Z");
    expect(await servicio.hayAvisosNuevos()).toBe(false);

    leerDelBackend.mockRejectedValue(new ErrorDeApi({ estado: 0, codigo: "sin_conexion", mensaje: "sin red" }));
    almacen.clear();
    expect(await servicio.hayAvisosNuevos()).toBe(false);
  });
});

describe("acciones de avisos", () => {
  it("marcar vistos guarda la fecha, solo si es válida, y nunca retrocede", async () => {
    await acciones.marcarAvisosVistosAccion("no es fecha");
    expect(fijar).not.toHaveBeenCalled();

    await acciones.marcarAvisosVistosAccion("2026-11-01T12:00:00.000Z");
    expect(fijar).toHaveBeenCalledWith("seniory_avisos_vistos", "2026-11-01T12:00:00.000Z", expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));

    fijar.mockClear();
    await acciones.marcarAvisosVistosAccion("2026-11-01T09:00:00.000Z");
    expect(fijar).not.toHaveBeenCalled();
  });

  it("cargar más valida el cursor, y los errores del backend llegan como mensaje", async () => {
    expect(await acciones.cargarAvisosAccion("a b")).toMatchObject({ ok: false });
    expect(leerDelBackend).not.toHaveBeenCalled();

    leerDelBackend.mockRejectedValue(new ErrorDeApi({ estado: 0, codigo: "sin_conexion", mensaje: "No pudimos conectar" }));
    expect(await acciones.cargarAvisosAccion("c1")).toMatchObject({ ok: false });
  });
});

describe("ListaDeAvisos", () => {
  const dos = [aviso("2", "2026-11-01T15:00:00.000Z", { prioridad: "alta", tipo: "alerta_generada:destinatario", titulo: "Alerta de Rosa" }), aviso("1", "2026-11-01T10:00:00.000Z")];

  it("sin avisos lo dice", () => {
    render(<ListaDeAvisos inicial={[]} siguiente={null} vistoHasta={undefined} base="/app" />);

    expect(screen.getByText("No tienes avisos")).toBeInTheDocument();
  });

  it("marca los nuevos y los importantes, y cada aviso lleva a su pantalla", () => {
    render(<ListaDeAvisos inicial={dos} siguiente={null} vistoHasta="2026-11-01T12:00:00.000Z" base="/app" />);

    const alerta = screen.getByRole("link", { name: /Alerta de Rosa/ });
    expect(alerta).toHaveAttribute("href", "/app/teleasistencia");
    expect(alerta).toHaveTextContent("Importante");
    expect(alerta).toHaveTextContent("Nuevo");
    const visto = screen.getByRole("link", { name: /Aviso 1/ });
    expect(visto).toHaveAttribute("href", "/app/servicios");
    expect(visto).not.toHaveTextContent("Nuevo");
  });

  it("un aviso sin pantalla en esa área se muestra sin enlace", () => {
    render(<ListaDeAvisos inicial={[dos[0] as Aviso]} siguiente={null} vistoHasta={undefined} base="/cuidador" />);

    expect(screen.getByText("Alerta de Rosa")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("«Ver avisos anteriores» agrega los siguientes sin repetir, hasta que no haya más", async () => {
    cargarAvisosAccion.mockResolvedValue({ ok: true, pagina: { avisos: [dos[1], aviso("0", "2026-10-31T10:00:00.000Z")], siguiente: null } });
    const usuario = userEvent.setup();
    render(<ListaDeAvisos inicial={dos} siguiente="c1" vistoHasta={undefined} base="/app" />);

    await usuario.click(screen.getByRole("button", { name: "Ver avisos anteriores" }));

    expect(await screen.findByText("Aviso 0")).toBeInTheDocument();
    expect(screen.getAllByText("Aviso 1")).toHaveLength(1);
    expect(cargarAvisosAccion).toHaveBeenCalledWith("c1");
    expect(screen.queryByRole("button", { name: "Ver avisos anteriores" })).not.toBeInTheDocument();
  });

  it("si no se pueden cargar más, lo dice y deja reintentar", async () => {
    cargarAvisosAccion.mockResolvedValue({ ok: false, mensaje: "No pudimos conectar." });
    const usuario = userEvent.setup();
    render(<ListaDeAvisos inicial={dos} siguiente="c1" vistoHasta={undefined} base="/app" />);

    await usuario.click(screen.getByRole("button", { name: "Ver avisos anteriores" }));

    expect(await screen.findByText("No pudimos conectar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver avisos anteriores" })).toBeEnabled();
  });
});

describe("Campana", () => {
  it("lleva a los avisos de su área, y el punto se anuncia a quien no ve", () => {
    const { rerender } = render(<Campana base="/app" hayNuevos={false} />);
    expect(screen.getByRole("link", { name: "Avisos" })).toHaveAttribute("href", "/app/avisos");

    rerender(<Campana base="/cuidador" hayNuevos />);
    expect(screen.getByRole("link", { name: "Avisos: tienes avisos nuevos" })).toHaveAttribute("href", "/cuidador/avisos");
  });
});
