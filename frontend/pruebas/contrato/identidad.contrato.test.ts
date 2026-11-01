// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  backendDisponible,
  CONTRASENA_DE_PRUEBA,
  correoUnico,
  crearCuenta,
  ipAleatoria,
  URL_DEL_BACKEND,
} from "../soporte/backend-local";

// Pruebas de CONTRATO de Identidad (INTEGRACION §6): llaman al backend local real y comprueban que responde lo que
// el frontend supone. Si el backend cambia algo de lo que el BFF necesita, falla aquí y no en producción.
// Sin el backend encendido se omiten.

const disponible = await backendDisponible();
const SECRETO = process.env.SENIORY_BFF_SECRETO ?? "";

interface Opciones {
  metodo?: string;
  cuerpo?: unknown;
  cookie?: string;
  ip?: string;
}
async function llamar(ruta: string, { metodo = "GET", cuerpo, cookie, ip = ipAleatoria() }: Opciones = {}) {
  return fetch(`${URL_DEL_BACKEND}${ruta}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "X-Seniory-BFF": SECRETO,
      "X-Cliente-IP": ip,
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

const cookieDe = (respuesta: Response, nombre: string) =>
  respuesta.headers.getSetCookie().find((linea) => linea.startsWith(`${nombre}=`));
const valorDe = (linea: string | undefined) => linea?.split(";")[0]?.split("=").slice(1).join("=");

describe.skipIf(!disponible)("contrato de Identidad con el backend local", () => {
  describe("las cookies de sesión (de ellas depende la sesión del BFF)", () => {
    it("el registro entrega ambas cookies: acceso para todo el sitio y refresco SOLO para /api/v1/auth, ambas HttpOnly", async () => {
      const respuesta = await llamar("/auth/registro", {
        metodo: "POST",
        cuerpo: { nombre: "Contrato Uno", correo: correoUnico("contrato"), contrasena: CONTRASENA_DE_PRUEBA, versionPolitica: "v1" },
      });

      expect(respuesta.status).toBe(201);
      const acceso = cookieDe(respuesta, "seniory_acceso") ?? "";
      const refresco = cookieDe(respuesta, "seniory_refresco") ?? "";
      expect(acceso).toMatch(/Path=\/;/);
      expect(acceso).toMatch(/HttpOnly/);
      // El BFF las reescribe a Path=/ precisamente porque el refresco trae esta otra ruta.
      expect(refresco).toMatch(/Path=\/api\/v1\/auth/);
      expect(refresco).toMatch(/HttpOnly/);
      expect(refresco).toMatch(/SameSite=Lax/i);
      // Ningún token viaja en el cuerpo.
      const cuerpo = (await respuesta.json()) as Record<string, unknown>;
      expect(Object.keys(cuerpo)).toEqual(["usuario"]);
      expect(Object.keys(cuerpo.usuario as object).sort()).toEqual(["correo", "id", "nombre", "rol"]);
      expect(JSON.stringify(cuerpo)).not.toMatch(/eyJ|token/i);
    });

    it("el acceso es un JWT con `exp` (el proxy lo lee para decidir si renovar)", async () => {
      const cuenta = await crearCuenta({ lista: false });
      const respuesta = await llamar("/auth/login", {
        metodo: "POST",
        cuerpo: { correo: cuenta.correo, contrasena: cuenta.contrasena },
        ip: cuenta.ip,
      });

      const token = valorDe(cookieDe(respuesta, "seniory_acceso")) ?? "";
      const partes = token.split(".");
      expect(partes).toHaveLength(3);
      const carga = JSON.parse(Buffer.from(partes[1] as string, "base64url").toString()) as { exp: number };
      expect(typeof carga.exp).toBe("number");
      const segundos = carga.exp - Date.now() / 1000;
      expect(segundos).toBeGreaterThan(60);
      expect(segundos).toBeLessThanOrEqual(15 * 60 + 5);
    });

    it("renovar responde 204 con las dos cookies nuevas, y un refresco recién usado todavía vale 30 s (ventana de gracia)", async () => {
      const cuenta = await crearCuenta({ lista: false });
      const entrada = await llamar("/auth/login", { metodo: "POST", cuerpo: { correo: cuenta.correo, contrasena: cuenta.contrasena }, ip: cuenta.ip });
      const refresco = valorDe(cookieDe(entrada, "seniory_refresco"));
      const enviar = () => llamar("/auth/refresh", { metodo: "POST", cookie: `seniory_refresco=${refresco}`, ip: cuenta.ip });

      const primera = await enviar();
      expect(primera.status).toBe(204);
      expect(cookieDe(primera, "seniory_acceso")).toBeDefined();
      expect(valorDe(cookieDe(primera, "seniory_refresco"))).not.toBe(refresco);

      // Varias navegaciones a la vez renuevan con el mismo token: la segunda NO debe cerrar la sesión.
      const segunda = await enviar();
      expect(segunda.status).toBe(204);
    });

    it("un refresco inventado da 401", async () => {
      const respuesta = await llamar("/auth/refresh", { metodo: "POST", cookie: "seniory_refresco=inventado-no-existe" });

      expect(respuesta.status).toBe(401);
    });

    it("cerrar sesión responde 204 y manda borrar las cookies", async () => {
      const cuenta = await crearCuenta({ lista: false });
      const entrada = await llamar("/auth/login", { metodo: "POST", cuerpo: { correo: cuenta.correo, contrasena: cuenta.contrasena }, ip: cuenta.ip });
      const refresco = valorDe(cookieDe(entrada, "seniory_refresco"));

      const salida = await llamar("/auth/logout", { metodo: "POST", cookie: `seniory_refresco=${refresco}`, ip: cuenta.ip });

      expect(salida.status).toBe(204);
      expect(valorDe(cookieDe(salida, "seniory_acceso"))).toBe("");
      // El refresco cerrado ya no sirve.
      const intento = await llamar("/auth/refresh", { metodo: "POST", cookie: `seniory_refresco=${refresco}`, ip: cuenta.ip });
      expect(intento.status).toBe(401);
    });
  });

  describe("GET /yo", () => {
    it("una familia sin persona: perfil sin teléfono ajeno y la lista de personas vacía", async () => {
      const cuenta = await crearCuenta({ lista: false });
      const entrada = await llamar("/auth/login", { metodo: "POST", cuerpo: { correo: cuenta.correo, contrasena: cuenta.contrasena }, ip: cuenta.ip });

      const respuesta = await llamar("/yo", { cookie: `seniory_acceso=${valorDe(cookieDe(entrada, "seniory_acceso"))}`, ip: cuenta.ip });

      expect(respuesta.status).toBe(200);
      const cuerpo = (await respuesta.json()) as { usuario: Record<string, unknown>; adultosMayores: unknown[] };
      expect(Object.keys(cuerpo.usuario).sort()).toEqual(["correo", "id", "nombre", "rol", "telefono"]);
      expect(cuerpo.usuario.rol).toBe("familiar");
      expect(cuerpo.adultosMayores).toEqual([]);
    });

    it("una familia lista: la persona trae exactamente los campos que usa el frontend, con la autorización vigente", async () => {
      const cuenta = await crearCuenta({ lista: true });
      const entrada = await llamar("/auth/login", { metodo: "POST", cuerpo: { correo: cuenta.correo, contrasena: cuenta.contrasena }, ip: cuenta.ip });

      const respuesta = await llamar("/yo", { cookie: `seniory_acceso=${valorDe(cookieDe(entrada, "seniory_acceso"))}`, ip: cuenta.ip });

      const { adultosMayores } = (await respuesta.json()) as { adultosMayores: Record<string, unknown>[] };
      expect(adultosMayores).toHaveLength(1);
      const persona = adultosMayores[0] as Record<string, unknown>;
      expect(Object.keys(persona).sort()).toEqual(["consentimientoDeSalud", "edad", "esResponsable", "fotoUrl", "id", "nombre", "parentesco"]);
      expect(persona).toMatchObject({ nombre: cuenta.nombreDeLaPersona, parentesco: "hijo_hija", esResponsable: true, consentimientoDeSalud: true, fotoUrl: null });
      expect(typeof persona.edad).toBe("number");
    });

    it("sin sesión da 401", async () => {
      expect((await llamar("/yo")).status).toBe(401);
    });
  });

  describe("errores (los que el frontend traduce a mensajes)", () => {
    it("credenciales malas: 401 con el código auth.credenciales_invalidas, sin decir si el correo existe", async () => {
      const cuenta = await crearCuenta({ lista: false });
      const conCuenta = await llamar("/auth/login", { metodo: "POST", cuerpo: { correo: cuenta.correo, contrasena: "mala-contrasena-123" }, ip: cuenta.ip });
      const sinCuenta = await llamar("/auth/login", { metodo: "POST", cuerpo: { correo: correoUnico("nadie"), contrasena: "mala-contrasena-123" } });

      expect(conCuenta.status).toBe(401);
      expect(sinCuenta.status).toBe(401);
      const a = (await conCuenta.json()) as { codigo: string; detail: string };
      const b = (await sinCuenta.json()) as { codigo: string; detail: string };
      expect(a.codigo).toBe("auth.credenciales_invalidas");
      expect(b.codigo).toBe(a.codigo);
      expect(b.detail).toBe(a.detail);
    });

    it("validación: 400 con `errores` por campo ({ campo, mensaje })", async () => {
      const respuesta = await llamar("/auth/registro", {
        metodo: "POST",
        cuerpo: { nombre: "", correo: "no-es-correo", contrasena: "x", versionPolitica: "v1" },
      });

      expect(respuesta.status).toBe(400);
      expect(respuesta.headers.get("content-type")).toContain("application/problem+json");
      const cuerpo = (await respuesta.json()) as { codigo: string; errores: { campo: string; mensaje: string }[]; idDeCorrelacion: string };
      expect(cuerpo.codigo).toBe("validacion");
      expect(cuerpo.errores.map((e) => e.campo)).toEqual(expect.arrayContaining(["nombre", "correo"]));
      expect(cuerpo.errores.every((e) => typeof e.mensaje === "string" && e.mensaje !== "")).toBe(true);
      expect(typeof cuerpo.idDeCorrelacion).toBe("string");
    });

    it("correo repetido: 409 con usuario.correo_ya_registrado", async () => {
      const cuenta = await crearCuenta({ lista: false });

      const respuesta = await llamar("/auth/registro", {
        metodo: "POST",
        cuerpo: { nombre: "Otra", correo: cuenta.correo, contrasena: CONTRASENA_DE_PRUEBA, versionPolitica: "v1" },
      });

      expect(respuesta.status).toBe(409);
      expect(((await respuesta.json()) as { codigo: string }).codigo).toBe("usuario.correo_ya_registrado");
    });

    it("contraseña común: 400 con contrasena.comun y un detalle en español", async () => {
      const respuesta = await llamar("/auth/registro", {
        metodo: "POST",
        cuerpo: { nombre: "Común", correo: correoUnico("comun"), contrasena: "1234567890", versionPolitica: "v1" },
      });

      expect(respuesta.status).toBe(400);
      const cuerpo = (await respuesta.json()) as { codigo: string; detail: string };
      expect(cuerpo.codigo).toBe("contrasena.comun");
      expect(cuerpo.detail).toMatch(/común/);
    });

    it("el límite de registros por IP responde 429 (y es por la IP que reenvía el BFF, no por la del servidor)", async () => {
      const ip = ipAleatoria();
      const estados: number[] = [];
      for (let i = 0; i < 7; i++) {
        const respuesta = await llamar("/auth/registro", {
          metodo: "POST",
          ip,
          cuerpo: { nombre: "Tope", correo: correoUnico("tope"), contrasena: CONTRASENA_DE_PRUEBA, versionPolitica: "v1" },
        });
        estados.push(respuesta.status);
      }

      expect(estados.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
      expect(estados.slice(5)).toEqual([429, 429]);
    });
  });

  describe("versiones legales (el frontend envía `v1`; el backend exige la vigente)", () => {
    it("el registro con una política que no es la vigente se rechaza", async () => {
      const respuesta = await llamar("/auth/registro", {
        metodo: "POST",
        cuerpo: { nombre: "Versión", correo: correoUnico("version"), contrasena: CONTRASENA_DE_PRUEBA, versionPolitica: "v0-antigua" },
      });

      expect(respuesta.status).toBe(400);
    });

    it("el consentimiento con una versión distinta de la vigente da consentimiento.version_no_vigente; con v1, 201 y luego 409", async () => {
      const cuenta = await crearCuenta({ lista: false });
      const entrada = await llamar("/auth/login", { metodo: "POST", cuerpo: { correo: cuenta.correo, contrasena: cuenta.contrasena }, ip: cuenta.ip });
      const cookie = `seniory_acceso=${valorDe(cookieDe(entrada, "seniory_acceso"))}`;
      const persona = await llamar("/adultos-mayores", {
        metodo: "POST",
        cookie,
        ip: cuenta.ip,
        cuerpo: { nombre: "Doña Rosa", fechaDeNacimiento: "1950-01-02", parentesco: "otro" },
      });
      const { adultoMayor } = (await persona.json()) as { adultoMayor: { id: string } };
      const ruta = `/adultos-mayores/${adultoMayor.id}/consentimientos`;
      const cuerpo = { finalidad: "datos_de_salud", calidad: "representante" };

      const mala = await llamar(ruta, { metodo: "POST", cookie, ip: cuenta.ip, cuerpo: { ...cuerpo, versionDelTexto: "v0" } });
      expect(mala.status).toBe(400);
      expect(((await mala.json()) as { codigo: string }).codigo).toBe("consentimiento.version_no_vigente");

      const buena = await llamar(ruta, { metodo: "POST", cookie, ip: cuenta.ip, cuerpo: { ...cuerpo, versionDelTexto: "v1" } });
      expect(buena.status).toBe(201);

      const repetida = await llamar(ruta, { metodo: "POST", cookie, ip: cuenta.ip, cuerpo: { ...cuerpo, versionDelTexto: "v1" } });
      expect(repetida.status).toBe(409);
      expect(((await repetida.json()) as { codigo: string }).codigo).toBe("consentimiento.ya_vigente");
    });
  });
});
