import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";

// Las acciones de cuenta dependen del cliente HTTP, de la sesión y de `next/navigation`: se sustituyen por dobles
// para probar su lógica (qué validan, qué envían, a dónde mandan y qué errores muestran).
const redirect = vi.fn((destino: string): never => {
  throw new Error(`REDIRECT:${destino}`);
});
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));

const pedirAlBackend = vi.fn();
const escribirEnBackend = vi.fn();
const leerDelBackend = vi.fn();
vi.mock("@/lib/api/cliente-servidor", () => ({ pedirAlBackend, escribirEnBackend, leerDelBackend }));

const guardarSesion = vi.fn(async () => undefined);
const borrarSesion = vi.fn(async () => undefined);
const tokenDeRefresco = vi.fn(async (): Promise<string | undefined> => "refresco-actual");
const verificarSesion = vi.fn();
vi.mock("@/lib/sesion", () => ({ guardarSesion, borrarSesion, tokenDeRefresco, verificarSesion }));

const acciones = await import("@/lib/acciones/cuenta");

const formulario = (campos: Record<string, string>) => {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) datos.set(nombre, valor);
  return datos;
};

// La acción que termina en `redirect` lanza: se extrae a dónde mandó.
async function destinoDe(accion: () => Promise<unknown>): Promise<string> {
  try {
    await accion();
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    if (mensaje.startsWith("REDIRECT:")) return mensaje.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("La acción no redirigió");
}

function conSesion(...cookies: string[]): Response {
  const encabezados = new Headers({ "content-type": "application/json" });
  for (const cookie of cookies) encabezados.append("set-cookie", cookie);
  return new Response(JSON.stringify({ usuario: { id: "u1" } }), { status: 201, headers: encabezados });
}
const problema = (estado: number, codigo: string, extra: object = {}) =>
  new Response(JSON.stringify({ codigo, title: "t", detail: "Detalle del backend", ...extra }), {
    status: estado,
    headers: { "content-type": "application/problem+json" },
  });

const REGISTRO_VALIDO = {
  nombre: "Andrea Gómez",
  correo: "andrea@correo.com",
  contrasena: "una-clave-larga-123",
  aceptaPolitica: "on",
};

beforeEach(() => {
  for (const doble of [redirect, pedirAlBackend, escribirEnBackend, leerDelBackend, guardarSesion, borrarSesion, verificarSesion]) {
    doble.mockClear();
  }
  pedirAlBackend.mockReset();
  escribirEnBackend.mockReset();
  leerDelBackend.mockReset();
  verificarSesion.mockReset();
  tokenDeRefresco.mockResolvedValue("refresco-actual");
});

describe("registrarse", () => {
  it("valida antes de ir al backend y devuelve lo escrito (nunca la contraseña)", async () => {
    const estado = await acciones.registrarse(
      {},
      formulario({ nombre: " ", correo: "malo", contrasena: "corta", telefono: "123" }),
    );

    expect(pedirAlBackend).not.toHaveBeenCalled();
    expect(Object.keys(estado.errores ?? {}).sort()).toEqual(["aceptaPolitica", "contrasena", "correo", "nombre", "telefono"]);
    expect(estado.valores).toMatchObject({ correo: "malo" });
    expect(JSON.stringify(estado)).not.toContain("corta");
  });

  it("envía la versión de la política, completa el celular con +57 y guarda la sesión", async () => {
    pedirAlBackend.mockResolvedValue(conSesion("seniory_acceso=a; Path=/", "seniory_refresco=r; Path=/api/v1/auth"));

    const destino = await destinoDe(() =>
      acciones.registrarse({}, formulario({ ...REGISTRO_VALIDO, telefono: "300 123 4567" })),
    );

    expect(destino).toBe("/bienvenida/persona");
    const [ruta, opciones] = pedirAlBackend.mock.calls[0] ?? [];
    expect(ruta).toBe("/auth/registro");
    expect(opciones).toMatchObject({
      metodo: "POST",
      sinSesion: true,
      cuerpo: {
        nombre: "Andrea Gómez",
        correo: "andrea@correo.com",
        contrasena: "una-clave-larga-123",
        telefono: "+573001234567",
        versionPolitica: "v1",
      },
    });
    expect(guardarSesion).toHaveBeenCalledTimes(1);
  });

  it("no manda `rol` ni nada que no sea del formulario", async () => {
    pedirAlBackend.mockResolvedValue(conSesion("seniory_acceso=a; Path=/"));

    await destinoDe(() => acciones.registrarse({}, formulario({ ...REGISTRO_VALIDO, rol: "administrador" })));

    const [, opciones] = pedirAlBackend.mock.calls[0] ?? [];
    expect(Object.keys((opciones as { cuerpo: object }).cuerpo).sort()).toEqual([
      "contrasena",
      "correo",
      "nombre",
      "versionPolitica",
    ]);
  });

  it("el correo ya registrado se explica junto al campo y conserva lo escrito", async () => {
    pedirAlBackend.mockResolvedValue(problema(409, "usuario.correo_ya_registrado"));

    const estado = await acciones.registrarse({}, formulario(REGISTRO_VALIDO));

    expect(estado.errores?.correo).toContain("Ya existe una cuenta");
    expect(estado.valores?.correo).toBe("andrea@correo.com");
    expect(estado.valores?.aceptaPolitica).toBe("on");
    expect(guardarSesion).not.toHaveBeenCalled();
  });

  it("si el backend no responde, lo dice sin lanzar", async () => {
    pedirAlBackend.mockRejectedValue(ErrorDeApi.deRed(new TypeError("fetch failed")));

    const estado = await acciones.registrarse({}, formulario(REGISTRO_VALIDO));

    expect(estado.mensaje).toContain("No pudimos conectar");
  });

  it("un error de configuración que NO es del backend se deja subir (no se esconde)", async () => {
    pedirAlBackend.mockRejectedValue(new Error("Falta la variable SENIORY_API_URL"));

    await expect(acciones.registrarse({}, formulario(REGISTRO_VALIDO))).rejects.toThrow("SENIORY_API_URL");
  });
});

describe("iniciarSesion", () => {
  const perfil = (rol: string, adultosMayores: object[] = []) => ({ usuario: { rol }, adultosMayores });

  it("pide los dos campos sin ir al backend", async () => {
    const estado = await acciones.iniciarSesion({}, formulario({ correo: "", contrasena: "" }));

    expect(pedirAlBackend).not.toHaveBeenCalled();
    expect(Object.keys(estado.errores ?? {}).sort()).toEqual(["contrasena", "correo"]);
  });

  it("credenciales inválidas: un mensaje genérico y el correo conservado", async () => {
    pedirAlBackend.mockResolvedValue(problema(401, "auth.credenciales_invalidas"));

    const estado = await acciones.iniciarSesion({}, formulario({ correo: "a@b.co", contrasena: "mala" }));

    expect(estado.mensaje).toBe("El correo o la contraseña no son correctos.");
    expect(estado.valores).toEqual({ correo: "a@b.co" });
  });

  it("demasiados intentos (429)", async () => {
    pedirAlBackend.mockResolvedValue(problema(429, "demasiadas_peticiones"));

    const estado = await acciones.iniciarSesion({}, formulario({ correo: "a@b.co", contrasena: "x" }));

    expect(estado.mensaje).toContain("demasiados intentos");
  });

  it("con la sesión guardada, consulta `/yo` con el token recién recibido (la cookie aún no viaja) y va a `volver`", async () => {
    pedirAlBackend.mockResolvedValue(conSesion("seniory_acceso=token-nuevo; Path=/", "seniory_refresco=r; Path=/api/v1/auth"));
    leerDelBackend.mockResolvedValue(perfil("familiar", [{ consentimientoDeSalud: true }]));

    const destino = await destinoDe(() =>
      acciones.iniciarSesion({}, formulario({ correo: "a@b.co", contrasena: "bien", volver: "/app/cuidadores" })),
    );

    expect(destino).toBe("/app/cuidadores");
    expect(guardarSesion).toHaveBeenCalledTimes(1);
    expect(leerDelBackend).toHaveBeenCalledWith("/yo", { tokenDeAcceso: "token-nuevo" });
  });

  it("ignora un `volver` de otro sitio", async () => {
    pedirAlBackend.mockResolvedValue(conSesion("seniory_acceso=t; Path=/"));
    leerDelBackend.mockResolvedValue(perfil("familiar", [{ consentimientoDeSalud: true }]));

    const destino = await destinoDe(() =>
      acciones.iniciarSesion({}, formulario({ correo: "a@b.co", contrasena: "bien", volver: "https://otro.com" })),
    );

    expect(destino).toBe("/app");
  });

  it.each([
    ["una familia sin persona", perfil("familiar"), "/bienvenida/persona"],
    ["una familia sin autorización", perfil("familiar", [{ consentimientoDeSalud: false }]), "/bienvenida/consentimiento"],
    ["un cuidador", perfil("cuidador"), "/cuidador"],
    ["un administrador", perfil("administrador"), "/admin"],
  ])("manda a %s a su destino", async (_nombre, datos, esperado) => {
    pedirAlBackend.mockResolvedValue(conSesion("seniory_acceso=t; Path=/"));
    leerDelBackend.mockResolvedValue(datos);

    expect(
      await destinoDe(() => acciones.iniciarSesion({}, formulario({ correo: "a@b.co", contrasena: "bien", volver: "/app" }))),
    ).toBe(esperado);
  });
});

describe("cerrarSesion", () => {
  it("avisa al backend con el refresco, borra las cookies y va a ingresar", async () => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await destinoDe(() => acciones.cerrarSesion())).toBe("/ingresar");

    expect(pedirAlBackend).toHaveBeenCalledWith("/auth/logout", {
      metodo: "POST",
      sinSesion: true,
      tokenDeRefresco: "refresco-actual",
    });
    expect(borrarSesion).toHaveBeenCalledTimes(1);
  });

  it("nunca falla para la persona: si el backend no responde, igual sale", async () => {
    pedirAlBackend.mockRejectedValue(ErrorDeApi.deRed(new TypeError("fetch failed")));

    expect(await destinoDe(() => acciones.cerrarSesion())).toBe("/ingresar");
    expect(borrarSesion).toHaveBeenCalledTimes(1);
  });

  it("sin refresco, igual borra y sale", async () => {
    tokenDeRefresco.mockResolvedValue(undefined);
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await destinoDe(() => acciones.cerrarSesion())).toBe("/ingresar");
    expect(pedirAlBackend).toHaveBeenCalledWith("/auth/logout", { metodo: "POST", sinSesion: true });
  });
});

describe("recuperar y restablecer la contraseña", () => {
  it("«olvidé mi contraseña» responde igual con o sin cuenta", async () => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 202 }));

    const estado = await acciones.solicitarRecuperacion({}, formulario({ correo: "nadie@correo.com" }));

    expect(estado).toEqual({ listo: true, valores: { correo: "nadie@correo.com" } });
  });

  it("si todavía no hay canal de correo (503), lo dice", async () => {
    pedirAlBackend.mockResolvedValue(problema(503, "recuperacion.no_disponible"));

    const estado = await acciones.solicitarRecuperacion({}, formulario({ correo: "a@b.co" }));

    expect(estado.mensaje).toContain("no está disponible por ahora");
    expect(estado.listo).toBeUndefined();
  });

  it("restablecer exige dos contraseñas iguales y sin ir al backend si no lo son", async () => {
    const estado = await acciones.restablecerContrasena(
      {},
      formulario({ token: "t".repeat(43), contrasena: "una-clave-larga-123", confirmacion: "otra-distinta-123" }),
    );

    expect(pedirAlBackend).not.toHaveBeenCalled();
    expect(estado.errores?.confirmacion).toContain("iguales");
  });

  it("restablecer con éxito manda a ingresar (no inicia sesión)", async () => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 204 }));

    const destino = await destinoDe(() =>
      acciones.restablecerContrasena(
        {},
        formulario({ token: "t".repeat(43), contrasena: "una-clave-larga-123", confirmacion: "una-clave-larga-123" }),
      ),
    );

    expect(destino).toBe("/ingresar?restablecida=1");
    expect(guardarSesion).not.toHaveBeenCalled();
    expect(pedirAlBackend.mock.calls[0]?.[1]).toMatchObject({
      cuerpo: { token: "t".repeat(43), contrasenaNueva: "una-clave-larga-123" },
    });
  });

  it("un enlace vencido se explica", async () => {
    pedirAlBackend.mockResolvedValue(problema(400, "recuperacion.enlace_no_valido"));

    const estado = await acciones.restablecerContrasena(
      {},
      formulario({ token: "t".repeat(43), contrasena: "una-clave-larga-123", confirmacion: "una-clave-larga-123" }),
    );

    expect(estado.mensaje).toContain("ya no es válido o venció");
  });

  it("sin token no hay nada que restablecer", async () => {
    const estado = await acciones.restablecerContrasena(
      {},
      formulario({ token: "", contrasena: "una-clave-larga-123", confirmacion: "una-clave-larga-123" }),
    );

    expect(estado.mensaje).toContain("enlace no es válido");
    expect(pedirAlBackend).not.toHaveBeenCalled();
  });
});

describe("registrarAdultoMayor", () => {
  const PERSONA = { nombre: "Doña Carmen", dia: "14", mes: "3", anio: "1948", parentesco: "hijo_hija" };

  it("valida nombre, fecha y parentesco", async () => {
    const estado = await acciones.registrarAdultoMayor({}, formulario({ nombre: "", dia: "31", mes: "2", anio: "1948", parentesco: "" }));

    expect(Object.keys(estado.errores ?? {}).sort()).toEqual(["fecha", "nombre", "parentesco"]);
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("envía la fecha como AAAA-MM-DD y sigue al consentimiento", async () => {
    escribirEnBackend.mockResolvedValue({ ok: true, datos: {} });

    expect(await destinoDe(() => acciones.registrarAdultoMayor({}, formulario(PERSONA)))).toBe("/bienvenida/consentimiento");
    expect(escribirEnBackend).toHaveBeenCalledWith("/adultos-mayores", {
      metodo: "POST",
      cuerpo: { nombre: "Doña Carmen", fechaDeNacimiento: "1948-03-14", parentesco: "hijo_hija" },
    });
  });

  it("un error de la edad del backend va junto a la fecha", async () => {
    escribirEnBackend.mockResolvedValue({
      ok: false,
      error: new ErrorDeApi({ estado: 400, codigo: "adulto_mayor.edad_invalida", mensaje: "La edad no puede superar los 120 años" }),
    });

    const estado = await acciones.registrarAdultoMayor({}, formulario(PERSONA));

    expect(estado.errores?.fecha).toContain("120");
  });
});

describe("otorgarConsentimiento", () => {
  const perfil = (adultosMayores: object[]) => ({ usuario: { rol: "familiar" }, adultosMayores });

  it("exige marcar la autorización", async () => {
    const estado = await acciones.otorgarConsentimiento({}, formulario({}));

    expect(estado.errores?.autorizo).toContain("debes autorizar");
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("autoriza a la persona de la SESIÓN, no la que diga el formulario, como representante y con la versión vigente", async () => {
    verificarSesion.mockResolvedValue(perfil([{ id: "p-uno", consentimientoDeSalud: true }, { id: "p-dos", consentimientoDeSalud: false }]));
    escribirEnBackend.mockResolvedValue({ ok: true, datos: {} });

    const destino = await destinoDe(() => acciones.otorgarConsentimiento({}, formulario({ autorizo: "on", adultoMayorId: "ajeno" })));

    expect(destino).toBe("/app");
    expect(escribirEnBackend).toHaveBeenCalledWith("/adultos-mayores/p-dos/consentimientos", {
      metodo: "POST",
      cuerpo: { finalidad: "datos_de_salud", calidad: "representante", versionDelTexto: "v1" },
    });
  });

  it("una autorización que ya estaba vigente no es un problema", async () => {
    verificarSesion.mockResolvedValue(perfil([{ id: "p-uno", consentimientoDeSalud: false }]));
    escribirEnBackend.mockResolvedValue({
      ok: false,
      error: new ErrorDeApi({ estado: 409, codigo: "consentimiento.ya_vigente", mensaje: "Ya hay una autorización vigente" }),
    });

    expect(await destinoDe(() => acciones.otorgarConsentimiento({}, formulario({ autorizo: "on" })))).toBe("/app");
  });

  it("si no queda nadie por autorizar, va a la app sin llamar al backend", async () => {
    verificarSesion.mockResolvedValue(perfil([{ id: "p-uno", consentimientoDeSalud: true }]));

    expect(await destinoDe(() => acciones.otorgarConsentimiento({}, formulario({ autorizo: "on" })))).toBe("/app");
    expect(escribirEnBackend).not.toHaveBeenCalled();
  });

  it("otro error del backend se muestra", async () => {
    verificarSesion.mockResolvedValue(perfil([{ id: "p-uno", consentimientoDeSalud: false }]));
    escribirEnBackend.mockResolvedValue({
      ok: false,
      error: new ErrorDeApi({ estado: 400, codigo: "consentimiento.version_no_vigente", mensaje: "Debes aceptar la versión vigente del texto" }),
    });

    const estado = await acciones.otorgarConsentimiento({}, formulario({ autorizo: "on" }));

    expect(estado.mensaje).toContain("versión vigente");
  });
});

describe("cambiarContrasena", () => {
  const CAMBIO = { contrasenaActual: "la-de-antes-123", contrasena: "una-clave-nueva-123", confirmacion: "una-clave-nueva-123" };

  it("valida antes de ir al backend", async () => {
    const estado = await acciones.cambiarContrasena({}, formulario({ contrasenaActual: "", contrasena: "corta", confirmacion: "otra" }));

    expect(Object.keys(estado.errores ?? {}).sort()).toEqual(["confirmacion", "contrasena", "contrasenaActual"]);
    expect(pedirAlBackend).not.toHaveBeenCalled();
  });

  it("guarda las cookies nuevas que devuelve el backend (cerró las otras sesiones)", async () => {
    pedirAlBackend.mockResolvedValue(
      new Response(null, { status: 204, headers: { "set-cookie": "seniory_acceso=nuevo; Path=/" } }),
    );

    const estado = await acciones.cambiarContrasena({}, formulario(CAMBIO));

    expect(estado).toEqual({ listo: true });
    expect(guardarSesion).toHaveBeenCalledTimes(1);
    expect(pedirAlBackend.mock.calls[0]?.[1]).toMatchObject({
      metodo: "PATCH",
      cuerpo: { contrasenaActual: "la-de-antes-123", contrasenaNueva: "una-clave-nueva-123" },
    });
  });

  it("una contraseña actual equivocada se explica junto a su campo", async () => {
    pedirAlBackend.mockResolvedValue(problema(400, "contrasena.actual_incorrecta", { detail: "La contraseña actual no es correcta" }));

    const estado = await acciones.cambiarContrasena({}, formulario(CAMBIO));

    expect(estado.errores?.contrasenaActual).toContain("actual no es correcta");
    expect(guardarSesion).not.toHaveBeenCalled();
  });

  it("una sesión vencida lleva a ingresar", async () => {
    pedirAlBackend.mockResolvedValue(new Response(null, { status: 401 }));

    expect(await destinoDe(() => acciones.cambiarContrasena({}, formulario(CAMBIO)))).toBe("/ingresar");
  });
});
