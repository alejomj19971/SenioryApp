// @vitest-environment node
import { randomInt } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  abrirSesion,
  backendDisponible,
  CONTRASENA_DE_PRUEBA,
  correoUnico,
  crearCuenta,
  hayAdministradorDePrueba,
  ipAleatoria,
  pedir,
  URL_DEL_BACKEND,
  type CuentaDePrueba,
} from "../soporte/backend-local";

// Contrato de la postulación y la verificación de cuidadores (INTEGRACION §6, M9) contra el backend local real: lo que
// el cuidador ve de sí mismo, los documentos como cuerpo binario, la cola de los revisores y la visibilidad en la
// búsqueda. Sin backend o sin el administrador de prueba, se omite.

const disponible = (await backendDisponible()) && hayAdministradorDePrueba;
const BFF = process.env.SENIORY_BFF_SECRETO ?? "";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const CAMPOS_DEL_PERFIL = ["aceptacionAutomatica", "aniosExperiencia", "bio", "controles", "disponibilidad", "documentos", "especialidad", "estado", "id", "latitud", "longitud", "nombre", "tarifaHora", "telefono", "titulo", "visible", "zona"];
const CAMPOS_DEL_DOCUMENTO = ["estado", "id", "nombre", "subidoEn", "tamanoBytes", "tipo"];
const CAMPOS_DEL_CONTROL = ["control", "estado", "motivoDeRechazo", "puedeRenovar", "vigenteHasta"];

interface Perfil {
  id: string;
  estado: string;
  visible: boolean;
  controles: { control: string; estado: string; motivoDeRechazo: string | null; vigenteHasta: string | null; puedeRenovar: boolean }[];
  documentos: { id: string; tipo: string }[];
  latitud: number | null;
  longitud: number | null;
}

describe.skipIf(!disponible)("contrato de la postulación y verificación con el backend local", () => {
  let cuenta: CuentaDePrueba;
  let cookie: string;
  let admin: string;
  let familia: { cuenta: CuentaDePrueba; cookie: string };
  let cuidadorId: string;

  const comoCuidador = (ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}) => pedir(ruta, { cookie, ip: cuenta.ip, ...opciones });
  const comoAdmin = (ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}) => pedir(ruta, { cookie: admin, ...opciones });
  const subir = (tipo: string, contenido: BodyInit = PDF, tipoDeContenido = "application/pdf") =>
    fetch(`${URL_DEL_BACKEND}/cuidadores/yo/documentos/${tipo}`, {
      method: "PUT",
      headers: { "Content-Type": tipoDeContenido, "X-Nombre-De-Archivo": encodeURIComponent(`${tipo} año.pdf`), "X-Seniory-BFF": BFF, "X-Cliente-IP": cuenta.ip, Cookie: cookie },
      body: contenido,
    });
  const miPerfil = async () => ((await (await comoCuidador("/cuidadores/yo")).json()) as { perfil: Perfil }).perfil;
  const pendientesDeEl = async (): Promise<{ id: string; control: string }[]> => {
    const { verificaciones } = (await (await comoAdmin("/verificaciones?estado=pendiente")).json()) as { verificaciones: { id: string; control: string; cuidador: { id: string } }[] };
    return verificaciones.filter((v) => v.cuidador.id === cuidadorId);
  };
  const decidir = (id: string, cuerpo: unknown) => comoAdmin(`/verificaciones/${id}`, { metodo: "PATCH", cuerpo });

  beforeAll(async () => {
    cuenta = { nombre: "Postulante de Prueba", correo: correoUnico("postulante"), contrasena: CONTRASENA_DE_PRUEBA, nombreDeLaPersona: "", ip: ipAleatoria() };
    const registro = await pedir("/auth/registro-cuidador", { metodo: "POST", ip: cuenta.ip, cuerpo: { nombre: cuenta.nombre, correo: cuenta.correo, contrasena: cuenta.contrasena, versionPolitica: "v1" } });
    expect(registro.status).toBe(201);
    cookie = await abrirSesion(cuenta);
    admin = await abrirSesion({ nombre: "", correo: process.env.ADMIN_DE_PRUEBA_CORREO ?? "", contrasena: process.env.ADMIN_DE_PRUEBA_CONTRASENA ?? "", nombreDeLaPersona: "", ip: ipAleatoria() });
    const cuentaDeFamilia = await crearCuenta({ lista: true });
    familia = { cuenta: cuentaDeFamilia, cookie: await abrirSesion(cuentaDeFamilia) };
  }, 60_000);

  it("la cuenta de cuidador no tiene perfil hasta que lo arma (404), y solo un cuidador tiene esta ruta", async () => {
    expect((await comoCuidador("/cuidadores/yo")).status).toBe(404);
    expect((await pedir("/cuidadores/yo", { cookie: familia.cookie, ip: familia.cuenta.ip })).status).toBe(403);
    expect((await pedir("/cuidadores/yo", { ip: "203.0.113.5" })).status).toBe(401);
    const yo = (await (await comoCuidador("/yo")).json()) as { usuario: { rol: string } };
    expect(yo.usuario.rol).toBe("cuidador");
  });

  it("crear el perfil: nace en borrador, oculto y con los tres controles sin solicitar", async () => {
    const respuesta = await comoCuidador("/cuidadores/yo", {
      metodo: "POST",
      cuerpo: { especialidad: "enfermeria", titulo: "Enfermera", aniosExperiencia: 4, tarifaHora: 18_000, telefono: `+57300${randomInt(1_000_000, 9_999_999)}`, zona: "Belén", disponibilidad: ["manana", "tarde"], bio: "Me gusta cuidar." },
    });

    expect(respuesta.status).toBe(201);
    const { perfil } = (await respuesta.json()) as { perfil: Perfil };
    expect(Object.keys(perfil).sort()).toEqual(CAMPOS_DEL_PERFIL);
    expect(perfil).toMatchObject({ visible: false, documentos: [], latitud: null, longitud: null });
    expect(perfil.estado).not.toBe("activo");
    expect(perfil.controles.map((c) => c.control)).toEqual(["antecedentes", "titulos", "psicotecnica"]);
    expect(perfil.controles.every((c) => c.estado === "sin_solicitar" && !c.puedeRenovar)).toBe(true);
    expect(Object.keys(perfil.controles[0] as object).sort()).toEqual(CAMPOS_DEL_CONTROL);
    cuidadorId = perfil.id;
    // Un perfil por cuenta
    expect((await comoCuidador("/cuidadores/yo", { metodo: "POST", cuerpo: { especialidad: "enfermeria", titulo: "x", aniosExperiencia: 1, tarifaHora: 1000, telefono: "+573001234567", zona: "x", disponibilidad: ["tarde"], bio: "x" } })).status).toBe(409);
  });

  it("corregir el perfil cambia solo lo enviado, y no deja enviar el nombre, el estado ni la visibilidad", async () => {
    const respuesta = await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { bio: "Bio corregida.", tarifaHora: 19_000 } });

    expect(respuesta.status).toBe(200);
    expect(((await respuesta.json()) as { perfil: { bio: string; tarifaHora: number; zona: string } }).perfil).toMatchObject({ bio: "Bio corregida.", tarifaHora: 19_000, zona: "Belén" });
    expect((await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { visible: true } })).status).toBe(400);
    expect((await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { estado: "activo" } })).status).toBe(400);
  });

  it("fija el pin (M2): las dos coordenadas juntas o ninguna, y dentro de Colombia", async () => {
    expect((await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { latitud: 6.2442 } })).status).toBe(400);
    expect((await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { latitud: 40.7128, longitud: -74.006 } })).status).toBe(400);

    const guardado = await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { latitud: 6.2442, longitud: -75.5812 } });
    expect(guardado.status).toBe(200);
    expect(((await guardado.json()) as { perfil: Perfil }).perfil).toMatchObject({ latitud: 6.2442, longitud: -75.5812 });
  });

  it("los documentos viajan como cuerpo binario: se acepta el PDF, y se rechaza lo que no es lo que dice ser", async () => {
    const buena = await subir("cedula");
    expect(buena.status).toBe(201);
    const { documento } = (await buena.json()) as { documento: Record<string, unknown> };
    expect(Object.keys(documento).sort()).toEqual(CAMPOS_DEL_DOCUMENTO);
    expect(documento).toMatchObject({ tipo: "cedula", estado: "pendiente", tamanoBytes: PDF.byteLength });

    // Dice ser PDF y no lo es: el servidor mira el contenido
    expect((await subir("antecedentes", "esto no es un pdf")).status).toBe(400);
    // Un tipo de contenido que no se acepta
    expect((await subir("antecedentes", PDF, "text/plain")).status).toBe(400);
    // Un documento que no existe
    expect((await subir("pasaporte")).status).toBe(400);
    // Pasa de 5 MB
    const grande = await subir("antecedentes", Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]));
    expect([400, 413]).toContain(grande.status);
    // La hoja de vida solo puede ser PDF
    expect((await subir("hoja_de_vida", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), "image/jpeg")).status).toBe(400);
  });

  it("no se puede pedir la revisión sin los cuatro documentos; con ellos, los tres controles quedan pendientes", async () => {
    const incompleta = await comoCuidador("/cuidadores/yo/revision", { metodo: "POST" });
    expect(incompleta.status).toBeGreaterThanOrEqual(400);
    expect(((await incompleta.json()) as { codigo: string }).codigo).toBe("revision.faltan_documentos");

    for (const tipo of ["antecedentes", "titulo", "psicotecnica"]) expect((await subir(tipo)).status).toBe(201);
    const enviada = await comoCuidador("/cuidadores/yo/revision", { metodo: "POST" });
    expect(enviada.status).toBe(200);
    const { perfil } = (await enviada.json()) as { perfil: Perfil };
    expect(perfil.controles.map((c) => c.estado)).toEqual(["pendiente", "pendiente", "pendiente"]);
    expect(perfil.visible).toBe(false);
    expect(perfil.documentos.map((d) => d.tipo).sort()).toEqual(["antecedentes", "cedula", "psicotecnica", "titulo"]);
  });

  it("la cola solo es de administradores y trae lo necesario para decidir", async () => {
    expect((await pedir("/verificaciones", { cookie, ip: cuenta.ip })).status).toBe(403);
    expect((await pedir("/verificaciones", { cookie: familia.cookie, ip: familia.cuenta.ip })).status).toBe(403);
    expect((await pedir("/verificaciones", { ip: "203.0.113.6" })).status).toBe(401);

    const respuesta = await comoAdmin("/verificaciones?estado=pendiente");
    expect(respuesta.status).toBe(200);
    const { verificaciones } = (await respuesta.json()) as { verificaciones: { id: string; control: string; estado: string; solicitadaEn: string; cuidador: { id: string }; documentos: { id: string; tipo: string }[] }[] };
    const mias = verificaciones.filter((v) => v.cuidador.id === cuidadorId);
    expect(mias).toHaveLength(3);
    expect(Object.keys(mias[0] as object).sort()).toEqual(["control", "cuidador", "documentos", "estado", "id", "solicitadaEn"]);
    expect(Object.keys((mias[0] as { cuidador: object }).cuidador).sort()).toEqual(["especialidad", "id", "nombre", "zona"]);
    // El documento de cada control y la cédula
    const deAntecedentes = mias.find((v) => v.control === "antecedentes");
    expect(deAntecedentes?.documentos.map((d) => d.tipo).sort()).toEqual(["antecedentes", "cedula"]);
    // El estado de la cola se valida
    expect((await comoAdmin("/verificaciones?estado=otra")).status).toBe(400);
  });

  it("un documento privado se abre solo con una dirección firmada para el revisor; nadie más lo recibe", async () => {
    const mias = await pendientesDeEl();
    const { verificaciones } = (await (await comoAdmin("/verificaciones?estado=pendiente")).json()) as { verificaciones: { id: string; documentos: { id: string }[] }[] };
    const documentoId = verificaciones.find((v) => v.id === mias[0]?.id)?.documentos[0]?.id as string;

    const abierto = await comoAdmin(`/verificaciones/documentos/${documentoId}`);
    expect(abierto.status).toBe(302);
    expect(abierto.headers.get("location")).toMatch(/^https?:\/\//);
    expect(abierto.headers.get("cache-control")).toContain("no-store");
    expect((await pedir(`/verificaciones/documentos/${documentoId}`, { cookie, ip: cuenta.ip })).status).toBe(403);
    expect((await pedir(`/verificaciones/documentos/${documentoId}`, { cookie: familia.cookie, ip: familia.cuenta.ip })).status).toBe(403);
  });

  it("rechazar pide el motivo, que el cuidador ve; y renovar exige un documento nuevo", async () => {
    const [primera] = await pendientesDeEl();
    const control = primera as { id: string; control: string };

    expect((await decidir(control.id, { decision: "rechazar" })).status).toBe(400);
    const rechazada = await decidir(control.id, { decision: "rechazar", motivo: "La foto no se lee." });
    expect(rechazada.status).toBe(200);
    const vista = (await miPerfil()).controles.find((c) => c.control === control.control);
    expect(vista).toMatchObject({ estado: "rechazada", motivoDeRechazo: "La foto no se lee.", puedeRenovar: true });

    // Sin un documento nuevo no se puede volver a pedir
    const sinNuevo = await comoCuidador(`/cuidadores/yo/verificaciones/${control.control}/renovacion`, { metodo: "POST" });
    expect(((await sinNuevo.json()) as { codigo: string }).codigo).toBe("verificacion.falta_documento_nuevo");
    const tipoDelControl = { antecedentes: "antecedentes", titulos: "titulo", psicotecnica: "psicotecnica" }[control.control] as string;
    expect((await subir(tipoDelControl)).status).toBe(201);
    const renovada = await comoCuidador(`/cuidadores/yo/verificaciones/${control.control}/renovacion`, { metodo: "POST" });
    expect(renovada.status).toBe(200);
    expect(((await renovada.json()) as { perfil: Perfil }).perfil.controles.find((c) => c.control === control.control)?.estado).toBe("pendiente");
    // Un control que no existe
    expect((await comoCuidador("/cuidadores/yo/verificaciones/otro/renovacion", { metodo: "POST" })).status).toBe(400);
  });

  it("aprobar exige la vigencia (menos el título); con los tres aprobados el cuidador se muestra a las familias", async () => {
    const antes = await comoAdmin("/verificaciones?estado=pendiente");
    expect(antes.status).toBe(200);
    expect((await familiaVe()).status).toBe(404);

    const pendientes = await pendientesDeEl();
    const por = (control: string) => pendientes.find((p) => p.control === control) as { id: string };
    const futuro = new Date(Date.now() + 2 * 365 * 86_400_000).toISOString().slice(0, 10);

    // Antecedentes y psicotécnica deben vencer: sin vigencia, no
    expect((await decidir(por("antecedentes").id, { decision: "aprobar" })).status).toBeGreaterThanOrEqual(400);
    // Una vigencia pasada o a más de 5 años, tampoco
    expect((await decidir(por("antecedentes").id, { decision: "aprobar", vigenteHasta: "2020-01-01" })).status).toBeGreaterThanOrEqual(400);
    expect((await decidir(por("antecedentes").id, { decision: "aprobar", vigenteHasta: "2099-01-01" })).status).toBeGreaterThanOrEqual(400);

    expect((await decidir(por("antecedentes").id, { decision: "aprobar", vigenteHasta: futuro })).status).toBe(200);
    expect((await decidir(por("psicotecnica").id, { decision: "aprobar", vigenteHasta: futuro })).status).toBe(200);
    const ultima = await decidir(por("titulos").id, { decision: "aprobar", vigenteHasta: null });
    expect(ultima.status).toBe(200);
    expect(((await ultima.json()) as { verificacion: { estado: string; cuidadorVisible: boolean } }).verificacion).toEqual({ estado: "aprobada", cuidadorVisible: true });

    const perfil = await miPerfil();
    expect(perfil).toMatchObject({ visible: true, estado: "activo" });
    expect(perfil.controles.find((c) => c.control === "antecedentes")?.vigenteHasta).toBe(futuro);
    expect((await familiaVe()).status).toBe(200);
    // Una decisión ya tomada no se repite
    expect((await decidir(por("titulos").id, { decision: "aprobar", vigenteHasta: null })).status).toBe(409);
  });

  it("ya activo, el perfil no deja cambiar la especialidad ni el título, pero sí lo demás", async () => {
    expect((await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { especialidad: "fisioterapia" } })).status).toBeGreaterThanOrEqual(400);
    expect((await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { titulo: "Otro título" } })).status).toBeGreaterThanOrEqual(400);
    const bien = await comoCuidador("/cuidadores/yo", { metodo: "PATCH", cuerpo: { zona: "Envigado", aceptacionAutomatica: true } });
    expect(bien.status).toBe(200);
    expect(((await bien.json()) as { perfil: { zona: string; aceptacionAutomatica: boolean } }).perfil).toMatchObject({ zona: "Envigado", aceptacionAutomatica: true });
  });

  async function familiaVe() {
    return pedir(`/cuidadores/${cuidadorId}`, { cookie: familia.cookie, ip: familia.cuenta.ip });
  }
});
