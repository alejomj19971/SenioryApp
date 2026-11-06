// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { abrirSesion, backendDisponible, crearCuenta, pedir, type CuentaDePrueba } from "../soporte/backend-local";

// Contrato de Directorio (INTEGRACION §6) contra el backend local real, con los cuidadores de las semillas
// (`npm run semillas` en backend/). Si no hay backend o no hay cuidadores visibles, se omite.

const disponible = await backendDisponible();

const CAMPOS_DEL_CUIDADOR = [
  "aceptacionAutomatica",
  "aniosExperiencia",
  "bio",
  "calificacion",
  "cantidadResenas",
  "controlesVerificados",
  "disponibilidad",
  "distanciaKm",
  "especialidad",
  "fotoUrl",
  "id",
  "nombre",
  "serviciosCompletados",
  "tarifaHora",
  "titulo",
  "zona",
];

interface Cuidador {
  id: string;
  nombre: string;
  zona: string;
  tarifaHora: number;
  controlesVerificados: string[];
  [clave: string]: unknown;
}

describe.skipIf(!disponible)("contrato de Directorio con el backend local", () => {
  let cuenta: CuentaDePrueba;
  let cookie: string;
  let primeros: Cuidador[];

  beforeAll(async () => {
    cuenta = await crearCuenta({ lista: false });
    cookie = await abrirSesion(cuenta);
    const respuesta = await pedir("/cuidadores?limite=50", { cookie, ip: cuenta.ip });
    primeros = ((await respuesta.json()) as { cuidadores: Cuidador[] }).cuidadores;
  });

  const sinSembrar = () => primeros.length === 0;

  it("exige sesión", async () => {
    expect((await pedir("/cuidadores")).status).toBe(401);
    expect((await pedir("/cuidadores/filtros")).status).toBe(401);
  });

  it("la búsqueda trae exactamente los campos que usa el frontend y NINGÚN dato de contacto (H1)", async () => {
    if (sinSembrar()) return;
    for (const cuidador of primeros) {
      expect(Object.keys(cuidador).sort()).toEqual(CAMPOS_DEL_CUIDADOR);
      expect(cuidador.controlesVerificados.sort()).toEqual(["antecedentes", "psicotecnica", "titulos"]);
    }
    expect(JSON.stringify(primeros)).not.toMatch(/telefono|"correo"|\+57|@/i);
  });

  it("los tipos son los del contrato (pesos enteros, calificación nula o número)", async () => {
    if (sinSembrar()) return;
    const c = primeros[0] as Cuidador;
    expect(Number.isInteger(c.tarifaHora)).toBe(true);
    expect(c.calificacion === null || typeof c.calificacion === "number").toBe(true);
    expect(Array.isArray(c.disponibilidad)).toBe(true);
    expect(typeof c.fotoUrl === "string" || c.fotoUrl === null).toBe(true);
  });

  it("pagina por cursor: la segunda página no repite a nadie y el cursor se pasa tal cual", async () => {
    if (primeros.length < 3) return;
    const uno = (await (await pedir("/cuidadores?limite=2", { cookie, ip: cuenta.ip })).json()) as {
      cuidadores: Cuidador[];
      siguiente: string | null;
    };
    expect(uno.cuidadores).toHaveLength(2);
    expect(typeof uno.siguiente).toBe("string");

    const dos = (await (await pedir(`/cuidadores?limite=2&cursor=${encodeURIComponent(uno.siguiente as string)}`, { cookie, ip: cuenta.ip })).json()) as {
      cuidadores: Cuidador[];
    };
    const idsUno = new Set(uno.cuidadores.map((c) => c.id));
    expect(dos.cuidadores.length).toBeGreaterThan(0);
    expect(dos.cuidadores.some((c) => idsUno.has(c.id))).toBe(false);
  });

  it("un cursor que no es nuestro da 400 (la acción de «Ver más» lo traduce)", async () => {
    const respuesta = await pedir("/cuidadores?cursor=basura", { cookie, ip: cuenta.ip });

    expect(respuesta.status).toBe(400);
  });

  it("los filtros se aplican en el servidor: zona, especialidad, tarifa máxima y texto sin tildes", async () => {
    if (sinSembrar()) return;
    const objetivo = primeros[0] as Cuidador;

    const porZona = (await (await pedir(`/cuidadores?zona=${encodeURIComponent(objetivo.zona)}`, { cookie, ip: cuenta.ip })).json()) as { cuidadores: Cuidador[] };
    expect(porZona.cuidadores.length).toBeGreaterThan(0);
    expect(porZona.cuidadores.every((c) => c.zona === objetivo.zona)).toBe(true);

    const porTarifa = (await (await pedir("/cuidadores?tarifaMaxima=1", { cookie, ip: cuenta.ip })).json()) as { cuidadores: Cuidador[] };
    expect(porTarifa.cuidadores).toEqual([]);

    const sinTilde = objetivo.nombre.split(" ")[0]?.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase() ?? "";
    const porTexto = (await (await pedir(`/cuidadores?busqueda=${encodeURIComponent(sinTilde)}`, { cookie, ip: cuenta.ip })).json()) as { cuidadores: Cuidador[] };
    expect(porTexto.cuidadores.map((c) => c.id)).toContain(objetivo.id);
  });

  it("sin lat/lon, distanciaKm siempre es null; buscar cerca de un punto sin cuidadores ubicados trae lista vacía", async () => {
    if (sinSembrar()) return;
    for (const cuidador of primeros) expect(cuidador.distanciaKm).toBeNull();

    // Un punto válido de Colombia donde las semillas no suelen tener a nadie ubicado: solo entran quienes SÍ
    // fijaron su pin (M2), así que o viene vacío o trae distanciaKm numérico en todos.
    const cerca = (await (await pedir("/cuidadores?lat=6.2442&lon=-75.5812", { cookie, ip: cuenta.ip })).json()) as { cuidadores: Cuidador[] };
    for (const cuidador of cerca.cuidadores) expect(typeof cuidador.distanciaKm).toBe("number");
  });

  it("lat y lon van juntos (400 si falta uno) y fuera de Colombia también es 400", async () => {
    expect((await pedir("/cuidadores?lat=6.24", { cookie, ip: cuenta.ip })).status).toBe(400);
    expect((await pedir("/cuidadores?lon=-75.58", { cookie, ip: cuenta.ip })).status).toBe(400);
    expect((await pedir("/cuidadores?lat=40.7128&lon=-74.006", { cookie, ip: cuenta.ip })).status).toBe(400);
  });

  it("un parámetro desconocido se rechaza (lista blanca): el frontend solo manda los suyos", async () => {
    const respuesta = await pedir("/cuidadores?rol=administrador", { cookie, ip: cuenta.ip });

    expect(respuesta.status).toBe(400);
  });

  it("los filtros disponibles traen zonas y la tarifa más alta de quienes se muestran", async () => {
    const respuesta = await pedir("/cuidadores/filtros", { cookie, ip: cuenta.ip });

    expect(respuesta.status).toBe(200);
    const filtros = (await respuesta.json()) as { zonas: string[]; tarifaMaxima: number; especialidades: string[]; jornadas: string[] };
    expect(Object.keys(filtros).sort()).toEqual(["especialidades", "jornadas", "tarifaMaxima", "zonas"]);
    expect(filtros.especialidades).toEqual(["auxiliar", "enfermeria", "fisioterapia", "acompanamiento"]);
    expect(filtros.jornadas).toEqual(["manana", "tarde", "noche"]);
    if (!sinSembrar()) {
      // De TODOS los que se muestran: con más de una página (los recorridos crean cuidadores) es mayor o igual al
      // máximo de la primera.
      expect(filtros.tarifaMaxima).toBeGreaterThanOrEqual(Math.max(...primeros.map((c) => c.tarifaHora)));
      expect(filtros.zonas.length).toBeGreaterThan(0);
    }
  });

  it("el perfil trae los mismos campos más las reseñas, y un id desconocido es 404", async () => {
    if (!sinSembrar()) {
      const respuesta = await pedir(`/cuidadores/${(primeros[0] as Cuidador).id}`, { cookie, ip: cuenta.ip });
      expect(respuesta.status).toBe(200);
      const { cuidador } = (await respuesta.json()) as { cuidador: Record<string, unknown> };
      expect(Object.keys(cuidador).sort()).toEqual([...CAMPOS_DEL_CUIDADOR, "resenas"].sort());
      expect(Array.isArray(cuidador.resenas)).toBe(true);
    }
    const ninguno = await pedir("/cuidadores/00000000-0000-4000-8000-000000000000", { cookie, ip: cuenta.ip });
    expect(ninguno.status).toBe(404);
  });

  it("un id que no es UUID da 400 (por eso el frontend lo filtra antes y responde «no encontrado»)", async () => {
    expect((await pedir("/cuidadores/c-marta-restrepo", { cookie, ip: cuenta.ip })).status).toBe(400);
  });

  it("la hoja de vida: 302 a una dirección firmada que entrega un PDF, o 404 si no tiene, o 503 sin almacén", async () => {
    if (sinSembrar()) return;
    const estados = new Set<number>();
    for (const cuidador of primeros) {
      const respuesta = await pedir(`/cuidadores/${cuidador.id}/hoja-de-vida`, { cookie, ip: cuenta.ip });
      estados.add(respuesta.status);
      expect([302, 404, 503]).toContain(respuesta.status);
      if (respuesta.status === 302) {
        const ubicacion = respuesta.headers.get("location") as string;
        expect(ubicacion).toMatch(/archivos\?/);
        const archivo = await fetch(ubicacion);
        expect(archivo.status).toBe(200);
        expect(archivo.headers.get("content-type")).toMatch(/^application\/pdf/);
        expect(archivo.headers.get("cache-control")).toContain("no-store");
        break; // con uno basta
      }
    }
    expect(estados.size).toBeGreaterThan(0);
  });

  it("una dirección firmada alterada no entrega nada (404 sin pistas)", async () => {
    const archivo = await fetch(`${process.env.SENIORY_API_URL ?? "http://localhost:3001/api/v1"}/archivos?clave=documentos/x.pdf&expira=1&firma=falsa`);

    expect(archivo.status).toBe(404);
  });
});
