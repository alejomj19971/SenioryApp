// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destinoTrasIngresar, rutaInternaSegura } from "@/lib/redireccion";
import { cookiesDeSesionDe, opcionesDeCookie } from "@/lib/sesion/cookies";
import { segundosParaVencer } from "@/lib/sesion/jwt";
import { renovarSesion } from "@/lib/sesion/renovar";

const codificar = (objeto: object) => Buffer.from(JSON.stringify(objeto)).toString("base64url");
const tokenConExp = (exp: unknown) => `${codificar({ alg: "HS256" })}.${codificar({ exp })}.firma`;

describe("segundosParaVencer (lectura optimista del exp, sin verificar la firma)", () => {
  const ahora = Date.UTC(2026, 10, 1, 12, 0, 0);
  const enSegundos = ahora / 1000;

  it("devuelve los segundos que le quedan a un token vigente", () => {
    expect(segundosParaVencer(tokenConExp(enSegundos + 600), ahora)).toBe(600);
  });

  it("un token vencido vale 0", () => {
    expect(segundosParaVencer(tokenConExp(enSegundos - 5), ahora)).toBe(0);
  });

  it("a punto de vencer devuelve los pocos segundos que quedan", () => {
    expect(segundosParaVencer(tokenConExp(enSegundos + 30), ahora)).toBe(30);
  });

  it.each([
    ["ausente", undefined],
    ["vacío", ""],
    ["sin tres partes", "a.b"],
    ["con carga que no es base64", "a.%%%.c"],
    ["con carga que no es JSON", `a.${Buffer.from("no-json").toString("base64url")}.c`],
    ["sin exp", `a.${codificar({ sub: "1" })}.c`],
    ["con exp que no es número", tokenConExp("mañana")],
    ["con exp infinito", `a.${Buffer.from('{"exp":1e999}').toString("base64url")}.c`],
  ])("un token %s se trata como vencido", (_nombre, token) => {
    expect(segundosParaVencer(token, ahora)).toBe(0);
  });
});

describe("rutaInternaSegura (nada de redirecciones abiertas)", () => {
  it.each(["/app", "/app/cuidadores", "/app/cuidadores?zona=Laureles", "/"])("acepta %s", (ruta) => {
    expect(rutaInternaSegura(ruta)).toBe(ruta);
  });

  it.each([
    ["vacía", ""],
    ["ausente", undefined],
    ["nula", null],
    ["otro sitio con //", "//otro.com"],
    ["otro sitio con https", "https://otro.com"],
    ["otro sitio con barra invertida", "/\\otro.com"],
    ["sin barra inicial", "app"],
    ["con caracteres de control", "/app\r\nSet-Cookie: a=b"],
    ["javascript:", "javascript:alert(1)"],
  ])("rechaza una ruta %s", (_nombre, ruta) => {
    expect(rutaInternaSegura(ruta)).toBeNull();
  });
});

describe("destinoTrasIngresar", () => {
  const conPersona = (consentimiento: boolean) => [{ consentimientoDeSalud: consentimiento }];

  it("una familia sin persona empieza por la bienvenida", () => {
    expect(destinoTrasIngresar({ rol: "familiar", adultosMayores: [] })).toBe("/bienvenida/persona");
  });

  it("una familia con persona pero sin autorización sigue por el consentimiento", () => {
    expect(destinoTrasIngresar({ rol: "familiar", adultosMayores: conPersona(false) })).toBe(
      "/bienvenida/consentimiento",
    );
  });

  it("una familia lista va a `volver` si es interna, o al inicio", () => {
    const datos = { rol: "familiar" as const, adultosMayores: conPersona(true) };
    expect(destinoTrasIngresar(datos, "/app/cuidadores")).toBe("/app/cuidadores");
    expect(destinoTrasIngresar(datos, "//otro.com")).toBe("/app");
    expect(destinoTrasIngresar(datos)).toBe("/app");
  });

  it("completar la bienvenida pesa más que `volver`", () => {
    expect(destinoTrasIngresar({ rol: "familiar", adultosMayores: [] }, "/app/cuidadores")).toBe("/bienvenida/persona");
  });

  it("el cuidador y el administrador van a su área", () => {
    expect(destinoTrasIngresar({ rol: "cuidador", adultosMayores: [] }, "/app")).toBe("/cuidador");
    expect(destinoTrasIngresar({ rol: "administrador", adultosMayores: [] }, "/app")).toBe("/admin");
  });
});

describe("cookiesDeSesionDe (los Set-Cookie del backend)", () => {
  function respuestaCon(...lineas: string[]): Response {
    const encabezados = new Headers();
    for (const linea of lineas) encabezados.append("set-cookie", linea);
    return new Response(null, { headers: encabezados });
  }

  it("lee nombre, valor y vencimiento de las dos cookies de sesión", () => {
    const cookies = cookiesDeSesionDe(
      respuestaCon(
        "seniory_acceso=abc.def.ghi; Path=/; Expires=Tue, 01 Dec 2026 13:49:37 GMT; HttpOnly; SameSite=Lax",
        "seniory_refresco=xyz; Path=/api/v1/auth; Expires=Tue, 01 Dec 2026 13:49:37 GMT; HttpOnly",
      ),
    );

    expect(cookies).toEqual([
      { nombre: "seniory_acceso", valor: "abc.def.ghi", expira: new Date("2026-12-01T13:49:37Z") },
      { nombre: "seniory_refresco", valor: "xyz", expira: new Date("2026-12-01T13:49:37Z") },
    ]);
  });

  it("ignora cualquier otra cookie", () => {
    const cookies = cookiesDeSesionDe(respuestaCon("otra=1; Path=/", "seniory_acceso=a; Path=/"));

    expect(cookies.map((c) => c.nombre)).toEqual(["seniory_acceso"]);
  });

  it("`Max-Age` manda sobre `Expires`", () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T12:00:00Z") });
    try {
      const [cookie] = cookiesDeSesionDe(
        respuestaCon("seniory_acceso=a; Max-Age=900; Expires=Tue, 01 Dec 2026 13:49:37 GMT"),
      );
      expect(cookie?.expira).toEqual(new Date("2026-11-01T12:15:00Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("una cookie que el backend manda borrar llega con valor vacío", () => {
    const [cookie] = cookiesDeSesionDe(respuestaCon("seniory_acceso=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"));

    expect(cookie).toMatchObject({ nombre: "seniory_acceso", valor: "" });
  });

  it("un valor con «=» (base64) se conserva entero", () => {
    const [cookie] = cookiesDeSesionDe(respuestaCon("seniory_refresco=abc==; Path=/api/v1/auth"));

    expect(cookie?.valor).toBe("abc==");
  });

  it("una línea sin nombre se descarta", () => {
    expect(cookiesDeSesionDe(respuestaCon("=basura", "sin-igual"))).toEqual([]);
  });
});

describe("opcionesDeCookie", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("siempre HttpOnly, SameSite=Lax y para todo el sitio (el refresco del backend trae otra ruta)", () => {
    expect(opcionesDeCookie()).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("Secure solo en producción", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(opcionesDeCookie().secure).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(opcionesDeCookie().secure).toBe(true);
  });

  it("conserva el vencimiento válido y descarta uno inválido", () => {
    const fecha = new Date("2026-12-01T00:00:00Z");
    expect(opcionesDeCookie(fecha).expires).toEqual(fecha);
    expect(opcionesDeCookie(new Date("no es fecha"))).not.toHaveProperty("expires");
  });
});

describe("renovarSesion", () => {
  const fetchFalso = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchFalso);
    fetchFalso.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const parametros = { urlDelBackend: "http://backend.local:3001/api/v1/", secretoBff: "s".repeat(40), refresco: "mi-refresco" };

  it("envía el refresco a mano, con el secreto del BFF, la IP y la correlación; y devuelve las cookies nuevas", async () => {
    const encabezados = new Headers();
    encabezados.append("set-cookie", "seniory_acceso=nuevo; Path=/");
    encabezados.append("set-cookie", "seniory_refresco=nuevo-r; Path=/api/v1/auth");
    fetchFalso.mockResolvedValue(new Response(null, { status: 204, headers: encabezados }));

    const resultado = await renovarSesion({ ...parametros, ip: "190.1.2.3", idDeCorrelacion: "corr-1" });

    const [url, init] = fetchFalso.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend.local:3001/api/v1/auth/refresh");
    const enviados = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(enviados.get("cookie")).toBe("seniory_refresco=mi-refresco");
    expect(enviados.get("x-seniory-bff")).toBe("s".repeat(40));
    expect(enviados.get("x-cliente-ip")).toBe("190.1.2.3");
    expect(enviados.get("x-request-id")).toBe("corr-1");
    expect(resultado).toEqual({
      tipo: "renovada",
      cookies: [
        { nombre: "seniory_acceso", valor: "nuevo" },
        { nombre: "seniory_refresco", valor: "nuevo-r" },
      ],
    });
  });

  it("401 significa que el refresco ya no sirve", async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 401 }));

    expect(await renovarSesion(parametros)).toEqual({ tipo: "rechazada" });
  });

  it.each([500, 502, 503])("%i no cierra la sesión: es «sin respuesta»", async (estado) => {
    fetchFalso.mockResolvedValue(new Response(null, { status: estado }));

    expect(await renovarSesion(parametros)).toEqual({ tipo: "sin_respuesta" });
  });

  it("una falla de red es «sin respuesta»", async () => {
    fetchFalso.mockRejectedValue(new TypeError("fetch failed"));

    expect(await renovarSesion(parametros)).toEqual({ tipo: "sin_respuesta" });
  });

  it("un 204 sin cookies también es «sin respuesta» (no hay nada que guardar)", async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await renovarSesion(parametros)).toEqual({ tipo: "sin_respuesta" });
  });
});
