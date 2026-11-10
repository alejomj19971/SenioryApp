import { beforeEach, describe, expect, it, vi } from "vitest";
import { validarPerfil, validarVigencia, type EntradaDePerfil } from "@/lib/acciones/validar-postulacion";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import { DOCUMENTOS_OBLIGATORIOS, resumenDeLaPostulacion, tieneLosDocumentos } from "@/lib/etiquetas-de-postulacion";
import type { ControlDelCuidador, DocumentoSubido, EstadoDeControl } from "@/lib/types";

const exigirRol = vi.fn();
vi.mock("@/lib/sesion", () => ({ exigirRol, verificarSesion: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const obtenerMiPerfil = vi.fn();
const crearMiPerfil = vi.fn();
const actualizarMiPerfil = vi.fn();
const solicitarRevision = vi.fn();
const renovarControl = vi.fn();
const subirDocumento = vi.fn();
vi.mock("@/lib/services/postulacion", () => ({
  obtenerMiPerfil,
  crearMiPerfil,
  actualizarMiPerfil,
  solicitarRevision,
  renovarControl,
  subirDocumento,
  TAMANO_MAXIMO_DE_DOCUMENTO: 5 * 1024 * 1024,
}));
const decidirControl = vi.fn();
const decidirHojaDeVida = vi.fn();
const abrirDocumentoDeRevision = vi.fn();
vi.mock("@/lib/services/verificaciones", () => ({ decidirControl, decidirHojaDeVida, abrirDocumentoDeRevision }));

const acciones = await import("@/lib/acciones/postulacion");
const rutaDeSubida = await import("@/app/api/cuidador/documentos/[tipo]/route");

const UUID = "01a19299-ec3b-7012-b94b-a8cebad258d3";

const entrada = (extra: Partial<EntradaDePerfil> = {}): EntradaDePerfil => ({
  especialidad: "enfermeria",
  titulo: "  Enfermera profesional ",
  aniosExperiencia: "5",
  tarifaHora: "20.000",
  telefono: "300 123 4567",
  zona: " Laureles ",
  disponibilidad: ["tarde", "manana"],
  bio: " Me gusta cuidar. ",
  ...extra,
});

describe("validarPerfil", () => {
  it("acepta un perfil válido, limpia los textos, normaliza el celular y la tarifa, y ordena las jornadas", () => {
    const resultado = validarPerfil(entrada());

    expect(resultado).toMatchObject({
      datos: { especialidad: "enfermeria", titulo: "Enfermera profesional", aniosExperiencia: 5, tarifaHora: 20_000, telefono: "+573001234567", zona: "Laureles", disponibilidad: ["manana", "tarde"], bio: "Me gusta cuidar." },
    });
  });

  it("pide lo que falta, cada cosa en su campo", () => {
    const resultado = validarPerfil(entrada({ especialidad: "", titulo: " ", aniosExperiencia: "", tarifaHora: "0", telefono: "123", zona: "", disponibilidad: [], bio: "" }));

    expect(Object.keys((resultado as { errores: object }).errores).sort()).toEqual(["aniosExperiencia", "bio", "disponibilidad", "especialidad", "tarifaHora", "telefono", "titulo", "zona"]);
  });

  it.each([["61"], ["-1"], ["cinco"], ["2.5"]])("rechaza %s años de experiencia", (anios) => {
    expect(validarPerfil(entrada({ aniosExperiencia: anios }))).toHaveProperty("errores.aniosExperiencia");
  });

  it("rechaza tarifas fuera de rango o con letras, y textos demasiado largos", () => {
    expect(validarPerfil(entrada({ tarifaHora: "10000001" }))).toHaveProperty("errores.tarifaHora");
    expect(validarPerfil(entrada({ tarifaHora: "veinte mil" }))).toHaveProperty("errores.tarifaHora");
    expect(validarPerfil(entrada({ titulo: "x".repeat(151) }))).toHaveProperty("errores.titulo");
    expect(validarPerfil(entrada({ zona: "x".repeat(101) }))).toHaveProperty("errores.zona");
    expect(validarPerfil(entrada({ bio: "x".repeat(1001) }))).toHaveProperty("errores.bio");
  });

  it("ignora una jornada que no existe", () => {
    expect(validarPerfil(entrada({ disponibilidad: ["madrugada"] }))).toHaveProperty("errores.disponibilidad");
  });

  it("conserva lo escrito para no hacer repetir", () => {
    const resultado = validarPerfil(entrada({ zona: "" }));

    expect((resultado as { valores: Record<string, string> }).valores).toMatchObject({ titulo: "Enfermera profesional", tarifaHora: "20.000", disponibilidad: "tarde,manana" });
  });

  it("un perfil activo no envía especialidad ni título (están congelados)", () => {
    const resultado = validarPerfil(entrada({ especialidad: "", titulo: "" }), { congelado: true });

    expect(resultado).toHaveProperty("datos");
    expect((resultado as { datos: object }).datos).not.toHaveProperty("especialidad");
    expect((resultado as { datos: object }).datos).not.toHaveProperty("titulo");
  });
});

describe("validarVigencia", () => {
  const hoy = "2026-11-01";

  it("vacío significa que no vence", () => {
    expect(validarVigencia("", hoy)).toBeUndefined();
  });

  it("acepta una fecha futura de hasta 5 años", () => {
    expect(validarVigencia("2026-11-02", hoy)).toBeUndefined();
    expect(validarVigencia("2031-11-01", hoy)).toBeUndefined();
  });

  it.each([["2026-11-01"], ["2020-01-01"], ["2031-11-02"], ["mañana"], ["2026-13-45"], ["01/11/2027"]])("rechaza «%s»", (texto) => {
    expect(validarVigencia(texto, hoy)).toBeDefined();
  });
});

describe("etiquetas de la postulación", () => {
  const control = (estado: EstadoDeControl): ControlDelCuidador => ({ control: "titulos", estado, motivoDeRechazo: null, vigenteHasta: null, puedeRenovar: false });
  const documento = (tipo: DocumentoSubido["tipo"]): DocumentoSubido => ({ id: tipo, tipo, nombre: `${tipo}.pdf`, estado: "pendiente", tamanoBytes: 10, subidoEn: "2026-11-01T10:00:00.000Z" });

  it("los cuatro documentos obligatorios no incluyen la hoja de vida", () => {
    expect(DOCUMENTOS_OBLIGATORIOS).toEqual(["cedula", "antecedentes", "titulo", "psicotecnica"]);
    expect(tieneLosDocumentos({ documentos: DOCUMENTOS_OBLIGATORIOS.map(documento) })).toBe(true);
    expect(tieneLosDocumentos({ documentos: [documento("cedula"), documento("hoja_de_vida")] })).toBe(false);
  });

  it("dice dónde va la postulación según el estado de los controles", () => {
    expect(resumenDeLaPostulacion({ visible: true, controles: [control("aprobada")] }).tono).toBe("exito");
    expect(resumenDeLaPostulacion({ visible: false, controles: [control("pendiente"), control("aprobada")] }).tono).toBe("espera");
    expect(resumenDeLaPostulacion({ visible: false, controles: [control("rechazada"), control("pendiente")] }).tono).toBe("atencion");
    expect(resumenDeLaPostulacion({ visible: false, controles: [control("vencida")] }).tono).toBe("atencion");
    expect(resumenDeLaPostulacion({ visible: false, controles: [control("sin_solicitar")] }).titulo).toMatch(/Todavía no te mostramos/);
  });
});

function formulario(campos: Record<string, string | string[]>): FormData {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) for (const v of Array.isArray(valor) ? valor : [valor]) datos.append(nombre, v);
  return datos;
}
const camposDePerfil = { especialidad: "enfermeria", titulo: "Enfermera", aniosExperiencia: "5", tarifaHora: "20000", telefono: "3001234567", zona: "Laureles", disponibilidad: ["tarde"], bio: "Hola" };

beforeEach(() => {
  for (const f of [exigirRol, obtenerMiPerfil, crearMiPerfil, actualizarMiPerfil, solicitarRevision, renovarControl, subirDocumento, decidirControl, decidirHojaDeVida]) f.mockReset();
});

describe("guardarPerfilAccion", () => {
  it("la primera vez crea el perfil; lo decide el servidor, no el formulario", async () => {
    obtenerMiPerfil.mockResolvedValue(null);
    crearMiPerfil.mockResolvedValue({ ok: true, datos: {} });

    const estado = await acciones.guardarPerfilAccion({}, formulario({ ...camposDePerfil, aceptacionAutomatica: "on" }));

    expect(estado).toEqual({ listo: true });
    expect(crearMiPerfil).toHaveBeenCalledWith(expect.objectContaining({ especialidad: "enfermeria", telefono: "+573001234567", tarifaHora: 20_000, disponibilidad: ["tarde"] }));
    expect(crearMiPerfil.mock.calls[0]?.[0]).not.toHaveProperty("aceptacionAutomatica");
    expect(actualizarMiPerfil).not.toHaveBeenCalled();
  });

  it("después actualiza, con la aceptación automática que se marcó", async () => {
    obtenerMiPerfil.mockResolvedValue({ estado: "borrador" });
    actualizarMiPerfil.mockResolvedValue({ ok: true, datos: {} });

    await acciones.guardarPerfilAccion({}, formulario({ ...camposDePerfil, aceptacionAutomatica: "on" }));

    expect(actualizarMiPerfil).toHaveBeenCalledWith(expect.objectContaining({ aceptacionAutomatica: true, titulo: "Enfermera" }));
    await acciones.guardarPerfilAccion({}, formulario(camposDePerfil));
    expect(actualizarMiPerfil.mock.calls[1]?.[0]).toMatchObject({ aceptacionAutomatica: false });
  });

  it("un perfil activo no manda especialidad ni título aunque el formulario los traiga", async () => {
    obtenerMiPerfil.mockResolvedValue({ estado: "activo" });
    actualizarMiPerfil.mockResolvedValue({ ok: true, datos: {} });

    await acciones.guardarPerfilAccion({}, formulario({ ...camposDePerfil, especialidad: "fisioterapia", titulo: "Otro" }));

    expect(actualizarMiPerfil.mock.calls[0]?.[0]).not.toHaveProperty("especialidad");
    expect(actualizarMiPerfil.mock.calls[0]?.[0]).not.toHaveProperty("titulo");
  });

  it("valida antes de llamar al backend y conserva lo escrito", async () => {
    obtenerMiPerfil.mockResolvedValue(null);

    const estado = await acciones.guardarPerfilAccion({}, formulario({ ...camposDePerfil, zona: "" }));

    expect(estado.errores).toHaveProperty("zona");
    expect(estado.valores).toMatchObject({ titulo: "Enfermera" });
    expect(crearMiPerfil).not.toHaveBeenCalled();
  });

  it("un error del backend llega como mensaje del formulario, sin perder lo escrito", async () => {
    obtenerMiPerfil.mockResolvedValue(null);
    crearMiPerfil.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 409, codigo: "cuidador.usuario_ya_tiene_perfil", mensaje: "Ya tienes un perfil" }) });

    const estado = await acciones.guardarPerfilAccion({}, formulario(camposDePerfil));

    expect(estado).toMatchObject({ mensaje: "Ya tienes un perfil", valores: { zona: "Laureles" } });
  });

  it("solo un cuidador (exigirRol redirige a quien no lo es)", async () => {
    exigirRol.mockRejectedValue(new Error("REDIRECT"));

    await expect(acciones.guardarPerfilAccion({}, formulario(camposDePerfil))).rejects.toThrow("REDIRECT");
    expect(exigirRol).toHaveBeenCalledWith("cuidador");
  });
});

describe("revisión y renovación", () => {
  it("pedir la revisión explica qué falta con palabras claras", async () => {
    solicitarRevision.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 422, codigo: "revision.faltan_documentos", mensaje: "Faltan documentos" }) });

    expect(await acciones.solicitarRevisionAccion()).toEqual({ mensaje: expect.stringContaining("Faltan documentos: sube la cédula") });
  });

  it("renovar valida el control antes de llamar", async () => {
    expect(await acciones.renovarControlAccion("otro")).toEqual({ mensaje: "Ese control no existe." });
    expect(renovarControl).not.toHaveBeenCalled();
    renovarControl.mockResolvedValue({ ok: true, datos: {} });
    expect(await acciones.renovarControlAccion("antecedentes")).toEqual({ listo: true });
  });
});

describe("decidirControlAccion (panel de revisores)", () => {
  it("solo un administrador, y valida el id", async () => {
    expect(await acciones.decidirControlAccion("no-uuid", {}, formulario({ decision: "aprobar" }))).toMatchObject({ mensaje: expect.stringContaining("No encontramos") });
    expect(exigirRol).toHaveBeenCalledWith("administrador");
    expect(decidirControl).not.toHaveBeenCalled();
  });

  it("aprobar manda la vigencia (o null si no vence) y valida la fecha", async () => {
    decidirControl.mockResolvedValue({ ok: true, datos: { estado: "aprobada", cuidadorVisible: false } });

    expect(await acciones.decidirControlAccion(UUID, {}, formulario({ decision: "aprobar", vigenteHasta: "" }))).toEqual({ listo: true });
    expect(decidirControl).toHaveBeenCalledWith(UUID, { decision: "aprobar", vigenteHasta: null });
    const mala = await acciones.decidirControlAccion(UUID, {}, formulario({ decision: "aprobar", vigenteHasta: "2020-01-01" }));
    expect(mala.errores).toHaveProperty("vigenteHasta");
    expect(decidirControl).toHaveBeenCalledTimes(1);
  });

  it("rechazar exige el motivo, que ve el cuidador", async () => {
    decidirControl.mockResolvedValue({ ok: true, datos: { estado: "rechazada", cuidadorVisible: false } });

    expect((await acciones.decidirControlAccion(UUID, {}, formulario({ decision: "rechazar", motivo: "   " }))).errores).toHaveProperty("motivo");
    expect((await acciones.decidirControlAccion(UUID, {}, formulario({ decision: "rechazar", motivo: "x".repeat(1001) }))).errores).toHaveProperty("motivo");
    expect(await acciones.decidirControlAccion(UUID, {}, formulario({ decision: "rechazar", motivo: " La foto no se lee " }))).toEqual({ listo: true });
    expect(decidirControl).toHaveBeenCalledWith(UUID, { decision: "rechazar", motivo: "La foto no se lee" });
  });

  it("otra decisión no existe; y una decisión ya tomada (409) se explica", async () => {
    expect(await acciones.decidirControlAccion(UUID, {}, formulario({ decision: "quizás" }))).toEqual({ mensaje: "Elige aprobar o rechazar." });
    decidirControl.mockResolvedValue({ ok: false, error: new ErrorDeApi({ estado: 409, codigo: "verificacion.ya_decidida", mensaje: "Otro revisor ya decidió este control" }) });
    expect(await acciones.decidirControlAccion(UUID, {}, formulario({ decision: "rechazar", motivo: "x" }))).toMatchObject({ mensaje: "Otro revisor ya decidió este control" });
  });

  it("la hoja de vida se aprueba o se rechaza, nada más", async () => {
    decidirHojaDeVida.mockResolvedValue({ ok: true, datos: {} });

    expect(await acciones.decidirHojaDeVidaAccion(UUID, "aprobar")).toEqual({ listo: true });
    expect(await acciones.decidirHojaDeVidaAccion(UUID, "borrar" as "aprobar")).toMatchObject({ mensaje: expect.any(String) });
    expect(decidirHojaDeVida).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/cuidador/documentos/[tipo] (la subida)", () => {
  const llamar = (tipo: string, { tipoDeContenido = "application/pdf", cuerpo = new Uint8Array([37, 80, 68, 70]), cabeceras = {} }: { tipoDeContenido?: string; cuerpo?: Uint8Array<ArrayBuffer>; cabeceras?: Record<string, string> } = {}) =>
    rutaDeSubida.POST(
      new Request("http://localhost:3100/api/cuidador/documentos/" + tipo, { method: "POST", headers: { "Content-Type": tipoDeContenido, "Host": "localhost:3100", "X-Nombre-De-Archivo": encodeURIComponent("mi cédula.pdf"), ...cabeceras }, body: cuerpo }),
      { params: Promise.resolve({ tipo }) } as never,
    );

  it("reenvía el archivo con su tipo y su nombre decodificado", async () => {
    subirDocumento.mockResolvedValue({ ok: true, datos: { id: "d1" } });

    const respuesta = await llamar("cedula");

    expect(respuesta.status).toBe(201);
    expect(await respuesta.json()).toEqual({ ok: true, documento: { id: "d1" } });
    expect(subirDocumento).toHaveBeenCalledWith("cedula", expect.any(Uint8Array), "application/pdf", "mi cédula.pdf");
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
  });

  it("descarta lo evidente sin molestar al backend", async () => {
    expect((await llamar("pasaporte")).status).toBe(404);
    expect((await llamar("cedula", { tipoDeContenido: "text/html" })).status).toBe(415);
    expect((await llamar("hoja_de_vida", { tipoDeContenido: "image/png" })).status).toBe(415);
    expect((await llamar("cedula", { cuerpo: new Uint8Array(0) })).status).toBe(400);
    expect((await llamar("cedula", { cuerpo: new Uint8Array(5 * 1024 * 1024 + 1) })).status).toBe(413);
    expect((await llamar("cedula", { cabeceras: { "Content-Length": String(6 * 1024 * 1024) } })).status).toBe(413);
    expect(subirDocumento).not.toHaveBeenCalled();
  });

  it("no acepta una subida que viene de otra página", async () => {
    const respuesta = await llamar("cedula", { cabeceras: { Origin: "https://sitio-malo.example" } });

    expect(respuesta.status).toBe(403);
    expect(subirDocumento).not.toHaveBeenCalled();
  });

  it("lo que dice el backend llega con su estado y mensaje; el almacén apagado y el exceso de intentos, con palabras claras", async () => {
    subirDocumento.mockResolvedValueOnce({ ok: false, error: new ErrorDeApi({ estado: 400, codigo: "documento.contenido_invalido", mensaje: "El archivo no es un PDF válido" }) });
    const mala = await llamar("cedula");
    expect(mala.status).toBe(400);
    expect(await mala.json()).toEqual({ ok: false, mensaje: "El archivo no es un PDF válido" });

    subirDocumento.mockResolvedValueOnce({ ok: false, error: new ErrorDeApi({ estado: 503, codigo: "archivos.no_disponible", mensaje: "x" }) });
    expect((await (await llamar("cedula")).json()).mensaje).toMatch(/no está disponible por ahora/);

    subirDocumento.mockResolvedValueOnce({ ok: false, error: new ErrorDeApi({ estado: 429, codigo: "limite", mensaje: "x" }) });
    expect((await (await llamar("cedula")).json()).mensaje).toMatch(/demasiadas solicitudes/);
  });
});
