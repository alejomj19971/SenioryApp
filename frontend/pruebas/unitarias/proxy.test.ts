// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Cuando un proxy pasa encabezados a la petición que continúa, Next los anuncia con estos encabezados
// internos de la respuesta.
const encabezadoDePeticion = (respuesta: Response, nombre: string) =>
  respuesta.headers.get(`x-middleware-request-${nombre}`);

// Un token de acceso con la caducidad que se pida (la firma no importa: el proxy solo lee `exp`).
function tokenQueVenceEn(segundos: number): string {
  const codificar = (objeto: object) => Buffer.from(JSON.stringify(objeto)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + segundos;
  return `${codificar({ alg: "HS256" })}.${codificar({ exp })}.firma`;
}

function pedir(ruta: string, cookies: Record<string, string> = {}, encabezados: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000${ruta}`, {
    headers: { ...encabezados, ...(cookie === "" ? {} : { cookie }) },
  });
}

const fetchFalso = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("SENIORY_API_URL", "http://backend.local:3001/api/v1");
  vi.stubEnv("SENIORY_BFF_SECRETO", "b".repeat(40));
  vi.stubGlobal("fetch", fetchFalso);
  fetchFalso.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// El backend renueva con dos `Set-Cookie`; las rutas son las suyas (el refresco con `Path=/api/v1/auth`).
function renovacionDelBackend(): Response {
  const encabezados = new Headers();
  encabezados.append("set-cookie", `seniory_acceso=${tokenQueVenceEn(900)}; Path=/; HttpOnly; SameSite=Lax`);
  encabezados.append("set-cookie", "seniory_refresco=refresco-nuevo; Path=/api/v1/auth; HttpOnly; SameSite=Lax");
  return new Response(null, { status: 204, headers: encabezados });
}

describe("proxy: correlación", () => {
  it("le da a cada petición un identificador de correlación UUID, en los encabezados de la PETICIÓN", async () => {
    const respuesta = await proxy(pedir("/"));

    expect(encabezadoDePeticion(respuesta, "x-request-id")).toMatch(FORMATO_UUID);
    // No se expone en la respuesta al navegador.
    expect(respuesta.headers.get("x-request-id")).toBeNull();
  });

  it("cada petición recibe un identificador distinto", async () => {
    const a = await proxy(pedir("/"));
    const b = await proxy(pedir("/"));

    expect(encabezadoDePeticion(a, "x-request-id")).not.toBe(encabezadoDePeticion(b, "x-request-id"));
  });

  it("no acepta un identificador que mande el cliente: lo reemplaza", async () => {
    const respuesta = await proxy(pedir("/", {}, { "x-request-id": "inyectado" }));

    expect(encabezadoDePeticion(respuesta, "x-request-id")).toMatch(FORMATO_UUID);
  });

  it("las páginas públicas pasan sin tocar nada", async () => {
    const respuesta = await proxy(pedir("/privacidad"));

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("location")).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("proxy: redirecciones optimistas", () => {
  it.each(["/app", "/app/cuidadores", "/bienvenida/persona", "/cuidador", "/admin"])(
    "sin sesión, %s va a /ingresar con la ruta para volver",
    async (ruta) => {
      const respuesta = await proxy(pedir(ruta));

      expect(respuesta.status).toBe(307);
      expect(respuesta.headers.get("location")).toBe(
        `http://localhost:3000/ingresar?volver=${encodeURIComponent(ruta)}`,
      );
    },
  );

  it("conserva la consulta de la ruta a la que volver", async () => {
    const respuesta = await proxy(pedir("/app/cuidadores?zona=Laureles"));

    expect(respuesta.headers.get("location")).toBe(
      `http://localhost:3000/ingresar?volver=${encodeURIComponent("/app/cuidadores?zona=Laureles")}`,
    );
  });

  it("con sesión, las pantallas de invitado van a /app", async () => {
    for (const ruta of ["/ingresar", "/registro"]) {
      const respuesta = await proxy(pedir(ruta, { seniory_refresco: "r" }));

      expect(respuesta.status).toBe(307);
      expect(respuesta.headers.get("location")).toBe("http://localhost:3000/app");
    }
  });

  it("sin sesión, las pantallas de invitado se muestran", async () => {
    const respuesta = await proxy(pedir("/ingresar"));

    expect(respuesta.status).toBe(200);
  });

  it("con un acceso vigente deja pasar sin llamar al backend", async () => {
    const respuesta = await proxy(
      pedir("/app", { seniory_acceso: tokenQueVenceEn(600), seniory_refresco: "r" }),
    );

    expect(respuesta.status).toBe(200);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("proxy: renovación de la sesión", () => {
  it("con el acceso vencido y un refresco, renueva y entrega las cookies nuevas al navegador y a la petición", async () => {
    fetchFalso.mockResolvedValue(renovacionDelBackend());

    const respuesta = await proxy(
      pedir("/app", { seniory_acceso: tokenQueVenceEn(-5), seniory_refresco: "refresco-viejo" }, { "x-forwarded-for": "190.1.2.3" }),
    );

    // Llamó al backend con el refresco, el secreto del BFF y la IP del navegador.
    const [url, init] = fetchFalso.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend.local:3001/api/v1/auth/refresh");
    const enviados = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(enviados.get("cookie")).toBe("seniory_refresco=refresco-viejo");
    expect(enviados.get("x-seniory-bff")).toBe("b".repeat(40));
    expect(enviados.get("x-cliente-ip")).toBe("190.1.2.3");

    // La respuesta al navegador: ambas cookies con `Path=/` (el backend pone otra ruta al refresco).
    expect(respuesta.status).toBe(200);
    expect(respuesta.cookies.get("seniory_refresco")?.value).toBe("refresco-nuevo");
    expect(respuesta.cookies.get("seniory_refresco")?.path).toBe("/");
    expect(respuesta.cookies.get("seniory_refresco")?.httpOnly).toBe(true);
    expect(respuesta.cookies.get("seniory_acceso")?.path).toBe("/");

    // Y la petición que continúa ya lleva el token nuevo.
    const cookieDeLaPeticion = encabezadoDePeticion(respuesta, "cookie") ?? "";
    expect(cookieDeLaPeticion).toContain("seniory_refresco=refresco-nuevo");
    expect(cookieDeLaPeticion).not.toContain("refresco-viejo");
  });

  it("renueva también cuando falta la cookie de acceso (venció y el navegador la descartó)", async () => {
    fetchFalso.mockResolvedValue(renovacionDelBackend());

    const respuesta = await proxy(pedir("/app", { seniory_refresco: "r" }));

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(respuesta.cookies.get("seniory_acceso")).toBeDefined();
  });

  it("renueva cuando al acceso le quedan menos de 60 segundos", async () => {
    fetchFalso.mockResolvedValue(renovacionDelBackend());

    await proxy(pedir("/app", { seniory_acceso: tokenQueVenceEn(30), seniory_refresco: "r" }));

    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("un token de acceso mal formado se trata como vencido", async () => {
    fetchFalso.mockResolvedValue(renovacionDelBackend());

    await proxy(pedir("/app", { seniory_acceso: "basura", seniory_refresco: "r" }));

    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("si el backend rechaza el refresco (401), borra las cookies y manda a ingresar", async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 401 }));

    const respuesta = await proxy(pedir("/app", { seniory_acceso: tokenQueVenceEn(-5), seniory_refresco: "robado" }));

    expect(respuesta.status).toBe(307);
    expect(respuesta.headers.get("location")).toBe("http://localhost:3000/ingresar");
    expect(respuesta.cookies.get("seniory_acceso")?.value).toBe("");
    expect(respuesta.cookies.get("seniory_refresco")?.value).toBe("");
  });

  it("si el backend no responde, NO cierra la sesión: deja pasar para que la pantalla muestre el error", async () => {
    fetchFalso.mockRejectedValue(new TypeError("fetch failed"));

    const respuesta = await proxy(pedir("/app", { seniory_acceso: tokenQueVenceEn(-5), seniory_refresco: "r" }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.cookies.get("seniory_refresco")).toBeUndefined();
  });

  it("si el backend responde 503, tampoco cierra la sesión", async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 503 }));

    const respuesta = await proxy(pedir("/app", { seniory_refresco: "r" }));

    expect(respuesta.status).toBe(200);
  });

  it("sin la configuración del backend no intenta renovar (la primera lectura dirá qué falta)", async () => {
    vi.stubEnv("SENIORY_API_URL", "");

    const respuesta = await proxy(pedir("/app", { seniory_refresco: "r" }));

    expect(respuesta.status).toBe(200);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("no usa una IP que no tenga forma de IP", async () => {
    fetchFalso.mockResolvedValue(renovacionDelBackend());

    await proxy(pedir("/app", { seniory_refresco: "r" }, { "x-forwarded-for": "<script>" }));

    const [, init] = fetchFalso.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("x-cliente-ip")).toBeNull();
  });
});

describe("matcher", () => {
  const patron = new RegExp(`^${(config.matcher[0] as string).replace(/^\//, "/")}$`);

  it.each(["/", "/app", "/app/cuidadores/c-marta-restrepo", "/ingresar", "/api/mensajeria/eventos"])(
    "cubre %s",
    (ruta) => {
      expect(patron.test(ruta)).toBe(true);
    },
  );

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/logo-icon.png",
    "/fotos/marta.jpg",
    "/hojas-de-vida/marta.pdf",
  ])("no cubre %s", (ruta) => {
    expect(patron.test(ruta)).toBe(false);
  });
});
