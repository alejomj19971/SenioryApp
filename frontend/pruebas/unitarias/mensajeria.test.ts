import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { leerMensajeDelFlujo } from "@/lib/hooks/use-flujo-de-mensajes";
import { fusionarMensajes, idLocalDe, marcarEnviando, marcarFallido, quitarLocal } from "@/lib/mensajes-de-chat";
import type { MensajeDeChat } from "@/lib/types";

const leerDelBackend = vi.fn();
const escribirEnBackend = vi.fn();
vi.mock("@/lib/api/cliente-servidor", () => ({ leerDelBackend, escribirEnBackend, abrirFlujoDelBackend: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const OTRO_UUID = "01a19299-ec3b-7012-b94b-a8cebad258d4";

const mensaje = (id: string, enviadoEn: string, extra: Partial<MensajeDeChat> = {}): MensajeDeChat => ({
  id,
  autor: "otro",
  texto: `texto ${id}`,
  enviadoEn,
  estado: "enviado",
  ...extra,
});

describe("fusionarMensajes (el backend entrega al menos una vez)", () => {
  it("un mismo mensaje que llega dos veces no se repite", () => {
    const a = mensaje("m1", "2026-11-01T10:00:00.000Z");

    expect(fusionarMensajes(fusionarMensajes([], [a]), [a])).toEqual([a]);
  });

  it("ordena por hora de envío, y por id si coinciden", () => {
    const resultado = fusionarMensajes([mensaje("m3", "2026-11-01T10:02:00.000Z")], [
      mensaje("m2", "2026-11-01T10:01:00.000Z"),
      mensaje("m1b", "2026-11-01T10:01:00.000Z"),
    ]);

    expect(resultado.map((m) => m.id)).toEqual(["m1b", "m2", "m3"]);
  });

  it("el mensaje del servidor sustituye al local que se escribió con ese idDeCliente", () => {
    const local = mensaje(idLocalDe(UUID), "2026-11-01T10:00:00.000Z", { idDeCliente: UUID, autor: "yo", estado: "enviando" });
    const delServidor = mensaje("m1", "2026-11-01T10:00:01.000Z", { idDeCliente: UUID, autor: "yo" });

    const resultado = fusionarMensajes([local], [delServidor]);

    expect(resultado).toEqual([delServidor]);
  });

  it("no toca al local de otro idDeCliente", () => {
    const local = mensaje(idLocalDe(OTRO_UUID), "2026-11-01T10:00:00.000Z", { idDeCliente: OTRO_UUID, autor: "yo", estado: "enviando" });

    const resultado = fusionarMensajes([local], [mensaje("m1", "2026-11-01T10:00:01.000Z", { idDeCliente: UUID, autor: "yo" })]);

    expect(resultado.map((m) => m.id)).toEqual([idLocalDe(OTRO_UUID), "m1"]);
  });

  it("marca como fallido, vuelve a enviando y descarta solo al local indicado", () => {
    const local = mensaje(idLocalDe(UUID), "2026-11-01T10:00:00.000Z", { idDeCliente: UUID, autor: "yo", estado: "enviando" });
    const otro = mensaje("m1", "2026-11-01T09:00:00.000Z");

    const fallido = marcarFallido([otro, local], UUID);
    expect(fallido.map((m) => m.estado)).toEqual(["enviado", "fallido"]);
    expect(marcarEnviando(fallido, UUID).map((m) => m.estado)).toEqual(["enviado", "enviando"]);
    expect(quitarLocal(fallido, UUID)).toEqual([otro]);
  });
});

describe("leerMensajeDelFlujo (lo que llega por la red es entrada de cualquiera)", () => {
  const valido = { id: "m1", conversacionId: "c1", autor: "otro", texto: "Hola", enviadoEn: "2026-11-01T10:00:00.000Z" };

  it("acepta un mensaje bien formado", () => {
    expect(leerMensajeDelFlujo(JSON.stringify(valido))).toEqual({
      conversacionId: "c1",
      mensaje: { id: "m1", autor: "otro", texto: "Hola", enviadoEn: "2026-11-01T10:00:00.000Z", estado: "enviado" },
    });
  });

  it("conserva el idDeCliente solo si es texto", () => {
    expect(leerMensajeDelFlujo(JSON.stringify({ ...valido, idDeCliente: UUID }))?.mensaje.idDeCliente).toBe(UUID);
    expect(leerMensajeDelFlujo(JSON.stringify({ ...valido, idDeCliente: 5 }))?.mensaje).not.toHaveProperty("idDeCliente");
  });

  it.each([["no es json"], ["null"], ["[]"], ['"texto"'], [JSON.stringify({ ...valido, autor: "admin" })], [JSON.stringify({ ...valido, id: 3 })], [JSON.stringify({ ...valido, texto: undefined })]])(
    "descarta %s",
    (datos) => {
      expect(leerMensajeDelFlujo(datos)).toBeNull();
    },
  );
});

const conversacionDelBackend = (extra: object = {}) => ({
  id: UUID,
  otraParte: { nombre: "Marta Gómez", fotoUrl: null, telefono: "+573001234567", correo: "m@x.co" },
  ultimoMensajeEn: null,
  puedeEscribir: true,
  ...extra,
});

const servicio = await import("@/lib/services/mensajeria");
const acciones = await import("@/lib/acciones/mensajeria");

beforeEach(() => {
  leerDelBackend.mockReset();
  escribirEnBackend.mockReset();
});

describe("servicio de mensajería: lo que llega a la pantalla", () => {
  it("de la otra parte solo se ve el nombre y la foto, aunque el backend mandara más", async () => {
    leerDelBackend.mockResolvedValue({ conversaciones: [conversacionDelBackend()] });

    const [conversacion] = await servicio.listarConversaciones();

    expect(conversacion).toEqual({ id: UUID, otraParte: { nombre: "Marta Gómez", foto: "" }, ultimoMensajeEn: null, puedeEscribir: true });
    expect(JSON.stringify(conversacion)).not.toMatch(/573001234567|m@x\.co/);
  });

  it("obtener una conversación ajena o inexistente es null, y una id mal formada ni siquiera consulta", async () => {
    leerDelBackend.mockResolvedValue({ conversaciones: [conversacionDelBackend()] });

    expect(await servicio.obtenerConversacion(OTRO_UUID)).toBeNull();
    expect(await servicio.obtenerConversacion("../x")).toBeNull();
    expect(leerDelBackend).toHaveBeenCalledTimes(1);
  });

  it("los mensajes llegan del más antiguo al más reciente, con el cursor de los anteriores", async () => {
    leerDelBackend.mockResolvedValue({
      mensajes: [
        { id: "m2", autor: "otro", texto: "dos", enviadoEn: "2026-11-01T10:02:00.000Z" },
        { id: "m1", autor: "yo", texto: "uno", enviadoEn: "2026-11-01T10:01:00.000Z", idDeCliente: UUID },
      ],
      siguiente: "cursor_1",
    });

    const pagina = await servicio.listarMensajes(UUID);

    expect(pagina.mensajes.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(pagina.anteriores).toBe("cursor_1");
    expect(pagina.mensajes[0]).toMatchObject({ idDeCliente: UUID, estado: "enviado" });
  });

  it("ignora un cursor con forma rara en vez de reenviarlo", async () => {
    leerDelBackend.mockResolvedValue({ mensajes: [], siguiente: null });

    await servicio.listarMensajes(UUID, "a b/../c");

    expect(leerDelBackend.mock.calls[0]?.[1]).toEqual({ consulta: { limite: "50" } });
  });
});

describe("acciones de mensajería", () => {
  it("enviar valida antes de llamar al backend", async () => {
    expect(await acciones.enviarMensajeAccion("no-uuid", "hola", UUID)).toMatchObject({ ok: false, mensaje: "No encontramos esa conversación." });
    expect(await acciones.enviarMensajeAccion(UUID, "hola", "x")).toMatchObject({ ok: false });
    expect(await acciones.enviarMensajeAccion(UUID, "   ", OTRO_UUID)).toMatchObject({ ok: false, mensaje: "Escribe un mensaje." });
    expect(await acciones.enviarMensajeAccion(UUID, 5, OTRO_UUID)).toMatchObject({ ok: false });
    expect(await acciones.enviarMensajeAccion(UUID, "x".repeat(1001), OTRO_UUID)).toMatchObject({ ok: false, mensaje: expect.stringContaining("1000") });
    expect(await acciones.enviarMensajeAccion(UUID, "hola\u0000", OTRO_UUID)).toMatchObject({ ok: false });
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("enviar manda el texto limpio y el idDeCliente", async () => {
    escribirEnBackend.mockResolvedValue({
      ok: true,
      datos: { mensaje: { id: "m1", autor: "yo", texto: "Hola", enviadoEn: "2026-11-01T10:00:00.000Z", idDeCliente: OTRO_UUID } },
    });

    const resultado = await acciones.enviarMensajeAccion(UUID, "  Hola  ", OTRO_UUID);

    expect(escribirEnBackend).toHaveBeenCalledWith(`/conversaciones/${UUID}/mensajes`, { metodo: "POST", cuerpo: { texto: "Hola", idDeCliente: OTRO_UUID } });
    expect(resultado).toMatchObject({ ok: true, mensaje: { id: "m1", estado: "enviado" } });
  });

  it("si el servicio terminó, lo dice con palabras claras", async () => {
    escribirEnBackend.mockResolvedValue({
      ok: false,
      error: new ErrorDeApi({ estado: 422, codigo: "conversacion.sin_servicio_activo", mensaje: "x" }),
    });

    const resultado = await acciones.enviarMensajeAccion(UUID, "Hola", OTRO_UUID);

    expect(resultado).toEqual({ ok: false, mensaje: expect.stringMatching(/^Ya no se puede escribir/) });
  });

  it("abrir la conversación lleva a ella", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: { conversacion: conversacionDelBackend() } });

    await expect(acciones.abrirConversacionAccion(OTRO_UUID)).rejects.toThrow(`REDIRECT:/app/mensajes/${UUID}`);
  });

  it("abrir sin un servicio con esa persona explica por qué", async () => {
    escribirEnBackend.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 422, codigo: "conversacion.sin_servicio_activo", mensaje: "x" }) });

    expect(await acciones.abrirConversacionAccion(OTRO_UUID)).toEqual({ mensaje: expect.stringContaining("servicio pedido") });
    expect(await acciones.abrirConversacionAccion("../x")).toEqual({ mensaje: "No encontramos a ese cuidador." });
  });

  it("cargar anteriores valida id y cursor", async () => {
    expect(await acciones.cargarMensajesAccion("x")).toMatchObject({ ok: false });
    expect(await acciones.cargarMensajesAccion(UUID, "a b")).toMatchObject({ ok: false });
    expect(leerDelBackend).not.toHaveBeenCalled();
  });
});
