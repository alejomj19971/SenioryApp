import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El cliente HTTP depende de `next/headers` y `next/navigation`, que solo existen dentro de una petición
// de Next: se sustituyen por dobles para probar su lógica (qué envía y cómo trata cada respuesta).
const entrantes = new Map<string, string>();
const cookiesEntrantes = new Map<string, string>();
const redirect = vi.fn((destino: string): never => {
  throw new Error(`REDIRECT:${destino}`);
});
const notFound = vi.fn((): never => {
  throw new Error("NOT_FOUND");
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers([...entrantes.entries()]),
  cookies: async () => ({
    get: (nombre: string) => {
      const valor = cookiesEntrantes.get(nombre);
      return valor === undefined ? undefined : { name: nombre, value: valor };
    },
  }),
}));
vi.mock("next/navigation", () => ({ redirect, notFound }));

const { escribirEnBackend, leerDelBackend, pedirAlBackend, TIEMPO_MAXIMO_MS } = await import(
  "@/lib/api/cliente-servidor"
);
const { ErrorDeApi } = await import("@/lib/api/error-de-api");

const SECRETO = "b".repeat(40);
const fetchFalso = vi.fn<typeof fetch>();

function json(estado: number, cuerpo: unknown, tipo = "application/json"): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": tipo } });
}
function problema(estado: number, codigo: string, extra: object = {}): Response {
  return json(estado, { codigo, title: "Un título", ...extra }, "application/problem+json");
}
const ultimaPeticion = () => {
  const [url, init] = fetchFalso.mock.calls.at(-1) ?? [];
  return { url: String(url), init: init as RequestInit, encabezados: new Headers(init?.headers) };
};

beforeEach(() => {
  vi.stubEnv("SENIORY_API_URL", "http://backend.local:3001/api/v1");
  vi.stubEnv("SENIORY_BFF_SECRETO", SECRETO);
  vi.stubGlobal("fetch", fetchFalso);
  entrantes.clear();
  cookiesEntrantes.clear();
  fetchFalso.mockReset();
  redirect.mockClear();
  notFound.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("pedirAlBackend: un archivo como cuerpo (F9)", () => {
  it("lo envía tal cual con su tipo y su nombre codificado, sin JSON, y con más tiempo si se pide", async () => {
    fetchFalso.mockResolvedValue(json(201, {}));
    const contenido = new Uint8Array(new ArrayBuffer(4));
    contenido.set([37, 80, 68, 70]);
    const espiar = vi.spyOn(AbortSignal, "timeout");

    await pedirAlBackend("/cuidadores/yo/documentos/cedula", { metodo: "PUT", archivo: { contenido, tipo: "application/pdf", nombre: "mi cédula.pdf" }, tiempoMaximoMs: 30_000 });

    const { init, encabezados } = ultimaPeticion();
    expect(init.method).toBe("PUT");
    expect(encabezados.get("Content-Type")).toBe("application/pdf");
    expect(encabezados.get("X-Nombre-De-Archivo")).toBe(encodeURIComponent("mi cédula.pdf"));
    expect(init.body).toBeInstanceOf(Blob);
    expect((init.body as Blob).size).toBe(4);
    expect(espiar).toHaveBeenCalledWith(30_000);
    espiar.mockRestore();
  });

  it("sin pedirlo, usa el tiempo máximo normal y envía JSON", async () => {
    fetchFalso.mockResolvedValue(json(200, {}));
    const espiar = vi.spyOn(AbortSignal, "timeout");

    await pedirAlBackend("/x", { metodo: "POST", cuerpo: { a: 1 } });

    expect(espiar).toHaveBeenCalledWith(TIEMPO_MAXIMO_MS);
    expect(ultimaPeticion().encabezados.get("Content-Type")).toBe("application/json");
    expect(ultimaPeticion().encabezados.get("X-Nombre-De-Archivo")).toBeNull();
    espiar.mockRestore();
  });
});

describe("pedirAlBackend: lo que envía", () => {
  it("manda el secreto del BFF, el identificador de correlación y la IP del navegador", async () => {
    entrantes.set("x-request-id", "0198-correlacion");
    entrantes.set("x-forwarded-for", "181.55.20.7, 10.0.0.1");
    fetchFalso.mockResolvedValue(json(200, {}));

    await pedirAlBackend("/yo");

    const { url, encabezados } = ultimaPeticion();
    expect(url).toBe("http://backend.local:3001/api/v1/yo");
    expect(encabezados.get("X-Seniory-BFF")).toBe(SECRETO);
    expect(encabezados.get("X-Request-Id")).toBe("0198-correlacion");
    expect(encabezados.get("X-Cliente-IP")).toBe("181.55.20.7");
  });

  it("no manda X-Cliente-IP si la dirección no tiene forma de IP (no se copia texto arbitrario)", async () => {
    entrantes.set("x-forwarded-for", "<script>alert(1)</script>");
    fetchFalso.mockResolvedValue(json(200, {}));

    await pedirAlBackend("/yo");

    expect(ultimaPeticion().encabezados.has("X-Cliente-IP")).toBe(false);
  });

  it("reenvía la cookie de acceso, y solo esa", async () => {
    cookiesEntrantes.set("seniory_acceso", "token-de-acceso");
    cookiesEntrantes.set("seniory_refresco", "token-de-refresco");
    fetchFalso.mockResolvedValue(json(200, {}));

    await pedirAlBackend("/yo");

    const cookie = ultimaPeticion().encabezados.get("Cookie");
    expect(cookie).toBe("seniory_acceso=token-de-acceso");
    expect(cookie).not.toContain("refresco");
  });

  it("sin sesión no manda cookie, y con `sinSesion` tampoco aunque exista", async () => {
    fetchFalso.mockResolvedValue(json(200, {}));
    await pedirAlBackend("/yo");
    expect(ultimaPeticion().encabezados.has("Cookie")).toBe(false);

    cookiesEntrantes.set("seniory_acceso", "token-de-acceso");
    await pedirAlBackend("/auth/login", { metodo: "POST", sinSesion: true });
    expect(ultimaPeticion().encabezados.has("Cookie")).toBe(false);
  });

  it("nunca manda Origin: es una llamada de servidor a servidor", async () => {
    fetchFalso.mockResolvedValue(json(200, {}));

    await pedirAlBackend("/yo", { metodo: "POST", cuerpo: { a: 1 } });

    expect(ultimaPeticion().encabezados.has("Origin")).toBe(false);
  });

  it("serializa el cuerpo como JSON y manda la clave de idempotencia", async () => {
    fetchFalso.mockResolvedValue(json(201, {}));

    await pedirAlBackend("/servicios", {
      metodo: "POST",
      cuerpo: { horas: 2 },
      claveDeIdempotencia: "clave-1",
    });

    const { init, encabezados } = ultimaPeticion();
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"horas":2}');
    expect(encabezados.get("Content-Type")).toBe("application/json");
    expect(encabezados.get("Idempotency-Key")).toBe("clave-1");
  });

  it("agrega los parámetros de consulta y una barra inicial si falta", async () => {
    fetchFalso.mockResolvedValue(json(200, []));

    await pedirAlBackend("cuidadores", { consulta: { zona: "Laureles, Medellín", limite: "20" } });

    expect(ultimaPeticion().url).toBe(
      "http://backend.local:3001/api/v1/cuidadores?zona=Laureles%2C+Medell%C3%ADn&limite=20",
    );
  });

  it("no guarda en caché, no sigue redirecciones y vence a los 8 segundos", async () => {
    fetchFalso.mockResolvedValue(json(200, {}));

    await pedirAlBackend("/yo");

    const { init } = ultimaPeticion();
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(TIEMPO_MAXIMO_MS).toBe(8_000);
  });

  it("sin la configuración lanza un error que dice qué variable falta", async () => {
    vi.stubEnv("SENIORY_BFF_SECRETO", "");

    await expect(pedirAlBackend("/yo")).rejects.toThrow(/SENIORY_BFF_SECRETO/);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("pedirAlBackend: cuando no hay respuesta", () => {
  it("sin red lanza un ErrorDeApi «sin conexión», sin la dirección interna", async () => {
    fetchFalso.mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED backend.local:3001"));

    const error = await pedirAlBackend("/yo").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorDeApi);
    expect(error).toMatchObject({ codigo: "sin_conexion" });
    expect((error as Error).message).not.toContain("backend.local");
  });

  it("si el backend no contesta a tiempo lanza «tiempo agotado»", async () => {
    const agotado = new Error("The operation was aborted due to timeout");
    agotado.name = "TimeoutError";
    fetchFalso.mockRejectedValue(agotado);

    await expect(pedirAlBackend("/yo")).rejects.toMatchObject({ codigo: "tiempo_agotado" });
  });
});

describe("leerDelBackend", () => {
  it("devuelve el cuerpo JSON de una respuesta correcta", async () => {
    fetchFalso.mockResolvedValue(json(200, { usuario: { nombre: "Andrea" } }));

    expect(await leerDelBackend("/yo")).toEqual({ usuario: { nombre: "Andrea" } });
  });

  it("un 401 lleva a ingresar", async () => {
    fetchFalso.mockResolvedValue(problema(401, "no_autenticado"));

    await expect(leerDelBackend("/yo")).rejects.toThrow("REDIRECT:/ingresar");
    expect(redirect).toHaveBeenCalledWith("/ingresar");
  });

  it("un 404 muestra «no encontrado»", async () => {
    fetchFalso.mockResolvedValue(problema(404, "no_encontrado"));

    await expect(leerDelBackend("/adultos-mayores/x")).rejects.toThrow("NOT_FOUND");
  });

  it("cualquier otro error se lanza como ErrorDeApi con su código y correlación", async () => {
    fetchFalso.mockResolvedValue(problema(500, "error_interno", { idDeCorrelacion: "0198-x" }));

    await expect(leerDelBackend("/yo")).rejects.toMatchObject({
      constructor: ErrorDeApi,
      estado: 500,
      codigo: "error_interno",
      idDeCorrelacion: "0198-x",
    });
  });

  it("un 502 del hosting (HTML) se lanza con el mensaje de servicio caído", async () => {
    fetchFalso.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(leerDelBackend("/yo")).rejects.toMatchObject({ codigo: "servicio_no_disponible" });
  });
});

describe("escribirEnBackend", () => {
  it("devuelve los datos de una respuesta correcta", async () => {
    fetchFalso.mockResolvedValue(json(201, { id: "1" }));

    expect(await escribirEnBackend("/adultos-mayores", { metodo: "POST", cuerpo: {} })).toEqual({
      ok: true,
      datos: { id: "1" },
    });
  });

  it("un 204 es correcto y no tiene datos", async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await escribirEnBackend("/auth/logout", { metodo: "POST" })).toEqual({
      ok: true,
      datos: undefined,
    });
  });

  it("un 409 se devuelve como valor para mostrarlo en el formulario, sin lanzar", async () => {
    fetchFalso.mockResolvedValue(
      problema(409, "usuario.correo_ya_registrado", { detail: "Ese correo ya está registrado" }),
    );

    const resultado = await escribirEnBackend("/auth/registro", { metodo: "POST", cuerpo: {} });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatchObject({
      estado: 409,
      codigo: "usuario.correo_ya_registrado",
      message: "Ese correo ya está registrado",
    });
  });

  it("un 400 trae los errores por campo", async () => {
    fetchFalso.mockResolvedValue(
      problema(400, "validacion", { errores: [{ campo: "correo", mensaje: "El correo no es válido" }] }),
    );

    const resultado = await escribirEnBackend("/auth/registro", { metodo: "POST", cuerpo: {} });

    expect(!resultado.ok && resultado.error.mensajeDelCampo("correo")).toBe("El correo no es válido");
  });

  it("la falta de red también se devuelve como valor", async () => {
    fetchFalso.mockRejectedValue(new TypeError("fetch failed"));

    const resultado = await escribirEnBackend("/auth/login", { metodo: "POST", cuerpo: {} });

    expect(resultado).toMatchObject({ ok: false, error: { codigo: "sin_conexion" } });
  });

  it("un 401 lleva a ingresar, salvo en rutas sin sesión (un inicio de sesión fallido no es una sesión caída)", async () => {
    fetchFalso.mockResolvedValue(problema(401, "no_autenticado"));
    await expect(
      escribirEnBackend("/adultos-mayores", { metodo: "POST", cuerpo: {} }),
    ).rejects.toThrow("REDIRECT:/ingresar");

    redirect.mockClear();
    const resultado = await escribirEnBackend("/auth/login", {
      metodo: "POST",
      cuerpo: {},
      sinSesion: true,
    });
    expect(resultado).toMatchObject({ ok: false, error: { estado: 401 } });
    expect(redirect).not.toHaveBeenCalled();
  });
});
