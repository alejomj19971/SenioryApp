import { describe, expect, it } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import {
  estadoDeError,
  MENSAJE_CORREO_REGISTRADO,
  MENSAJE_CREDENCIALES,
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_ENLACE_NO_VALIDO,
  MENSAJE_NO_DISPONIBLE,
} from "@/lib/acciones/errores-de-cuenta";
import {
  normalizarTelefono,
  soloErrores,
  validarContrasenaNueva,
  validarCorreo,
  validarFechaDeNacimiento,
  validarNombre,
  validarParentesco,
  validarTelefonoOpcional,
} from "@/lib/acciones/validar-cuenta";

const HOY = new Date("2026-11-01T12:00:00Z");

describe("validaciones de cuenta (replican las del backend)", () => {
  it("nombre: obligatorio y de hasta 100 caracteres", () => {
    expect(validarNombre("Andrea")).toBeUndefined();
    expect(validarNombre("   ")).toBe("El nombre es obligatorio.");
    expect(validarNombre("a".repeat(101))).toContain("100 caracteres");
    expect(validarNombre("", "El nombre de la persona")).toBe("El nombre de la persona es obligatorio.");
  });

  it("correo: obligatorio y con forma de correo", () => {
    expect(validarCorreo("andrea@correo.com")).toBeUndefined();
    expect(validarCorreo("  andrea@correo.com  ")).toBeUndefined();
    expect(validarCorreo("")).toBe("El correo es obligatorio.");
    expect(validarCorreo("andrea")).toContain("correo válido");
    expect(validarCorreo("andrea@correo")).toContain("correo válido");
    expect(validarCorreo(`${"a".repeat(250)}@x.co`)).toContain("correo válido");
  });

  it("contraseña nueva: de 10 a 128 caracteres", () => {
    expect(validarContrasenaNueva("1234567890")).toBeUndefined();
    expect(validarContrasenaNueva("corta")).toContain("al menos 10");
    expect(validarContrasenaNueva("a".repeat(129))).toContain("128 caracteres o menos");
  });

  it("teléfono: opcional; un celular colombiano de diez dígitos se completa con +57", () => {
    expect(validarTelefonoOpcional("")).toBeUndefined();
    expect(validarTelefonoOpcional("300 123 4567")).toBeUndefined();
    expect(validarTelefonoOpcional("+573001234567")).toBeUndefined();
    expect(validarTelefonoOpcional("123")).toContain("celular válido");
    expect(validarTelefonoOpcional("abcdefghij")).toContain("celular válido");
    expect(normalizarTelefono("300 123 4567")).toBe("+573001234567");
    expect(normalizarTelefono("(300) 123-4567")).toBe("+573001234567");
    expect(normalizarTelefono("+34 600 123 456")).toBe("+34600123456");
  });

  it("parentesco: solo los del backend", () => {
    for (const valor of ["hijo_hija", "nieto_nieta", "conyuge", "hermano_hermana", "otro"]) {
      expect(validarParentesco(valor)).toBeUndefined();
    }
    expect(validarParentesco("")).toBeDefined();
    expect(validarParentesco("amigo")).toBeDefined();
  });

  it("soloErrores deja únicamente los campos con error", () => {
    expect(soloErrores({ a: undefined, b: "mal", c: undefined })).toEqual({ b: "mal" });
  });
});

describe("validarFechaDeNacimiento", () => {
  it("compone AAAA-MM-DD", () => {
    expect(validarFechaDeNacimiento("14", "3", "1948", HOY)).toEqual({ fecha: "1948-03-14" });
    expect(validarFechaDeNacimiento("1", "12", "2000", HOY)).toEqual({ fecha: "2000-12-01" });
  });

  it("pide las tres listas", () => {
    for (const [d, m, a] of [["", "3", "1948"], ["14", "", "1948"], ["14", "3", ""]]) {
      expect(validarFechaDeNacimiento(d as string, m as string, a as string, HOY)).toHaveProperty("error");
    }
  });

  it("rechaza fechas que no existen", () => {
    expect(validarFechaDeNacimiento("31", "4", "1950", HOY)).toHaveProperty("error");
    expect(validarFechaDeNacimiento("30", "2", "1950", HOY)).toHaveProperty("error");
    expect(validarFechaDeNacimiento("29", "2", "1951", HOY)).toHaveProperty("error");
    expect(validarFechaDeNacimiento("0", "1", "1950", HOY)).toHaveProperty("error");
    expect(validarFechaDeNacimiento("10", "13", "1950", HOY)).toHaveProperty("error");
  });

  it("acepta el 29 de febrero de un año bisiesto (también el de 2000, no el de 1900)", () => {
    expect(validarFechaDeNacimiento("29", "2", "1952", HOY)).toEqual({ fecha: "1952-02-29" });
    expect(validarFechaDeNacimiento("29", "2", "2000", HOY)).toEqual({ fecha: "2000-02-29" });
    expect(validarFechaDeNacimiento("29", "2", "1900", HOY)).toHaveProperty("error");
  });

  it("rechaza el futuro y más de 120 años", () => {
    expect(validarFechaDeNacimiento("2", "11", "2026", HOY)).toEqual({ error: "La fecha de nacimiento no puede ser futura." });
    expect(validarFechaDeNacimiento("1", "1", "1900", HOY)).toHaveProperty("error");
  });

  it("no se deja engañar por valores que no son números", () => {
    expect(validarFechaDeNacimiento("x", "3", "1948", HOY)).toHaveProperty("error");
    expect(validarFechaDeNacimiento("14.5", "3", "1948", HOY)).toHaveProperty("error");
  });
});

describe("estadoDeError (del backend a la pantalla)", () => {
  const error = (estado: number, codigo: string, mensaje = "Mensaje del backend", errores: { campo: string; mensaje: string }[] = []) =>
    new ErrorDeApi({ estado, codigo, mensaje, errores });

  it("demasiados intentos (429)", () => {
    expect(estadoDeError(error(429, "demasiadas_peticiones"))).toEqual({ mensaje: MENSAJE_DEMASIADOS_INTENTOS });
  });

  it("no disponible (503), sin fingir", () => {
    expect(estadoDeError(error(503, "recuperacion.no_disponible"))).toEqual({ mensaje: MENSAJE_NO_DISPONIBLE });
  });

  it("credenciales inválidas: un solo mensaje, sin distinguir la causa", () => {
    expect(estadoDeError(error(401, "auth.credenciales_invalidas"))).toEqual({ mensaje: MENSAJE_CREDENCIALES });
  });

  it("correo ya registrado: junto al campo del correo", () => {
    expect(estadoDeError(error(409, "usuario.correo_ya_registrado"))).toEqual({ errores: { correo: MENSAJE_CORREO_REGISTRADO } });
  });

  it("enlace de recuperación inválido", () => {
    expect(estadoDeError(error(400, "recuperacion.enlace_no_valido"))).toEqual({ mensaje: MENSAJE_ENLACE_NO_VALIDO });
  });

  it("errores de validación del backend: cada uno en su campo, con el nombre del formulario", () => {
    const resultado = estadoDeError(
      error(400, "validacion", "x", [
        { campo: "nombre", mensaje: "El nombre debe tener entre 1 y 100 caracteres" },
        { campo: "contrasenaNueva", mensaje: "La contraseña debe tener entre 10 y 128 caracteres" },
        { campo: "fechaDeNacimiento", mensaje: "Formato" },
        { campo: "nombre", mensaje: "segundo error del mismo campo" },
      ]),
    );

    expect(resultado.errores).toEqual({
      nombre: "El nombre debe tener entre 1 y 100 caracteres",
      contrasena: "La contraseña debe tener entre 10 y 128 caracteres",
      fecha: "Formato",
    });
  });

  it.each([
    ["contrasena.comun", "contrasena"],
    ["contrasena.actual_incorrecta", "contrasenaActual"],
    ["correo.invalido", "correo"],
    ["telefono.invalido", "telefono"],
    ["parentesco.invalido", "parentesco"],
    ["fecha.inexistente", "fecha"],
    ["adulto_mayor.edad_invalida", "fecha"],
  ])("el código %s va al campo %s", (codigo, campo) => {
    expect(estadoDeError(error(400, codigo, "Texto del backend")).errores).toEqual({ [campo]: "Texto del backend" });
  });

  it("un código desconocido se muestra como mensaje de la pantalla", () => {
    expect(estadoDeError(error(500, "algo.raro", "Algo falló"))).toEqual({ mensaje: "Algo falló" });
  });

  it("devuelve los valores escritos para no hacer repetir al usuario", () => {
    expect(estadoDeError(error(401, "auth.credenciales_invalidas"), { correo: "a@b.co" }).valores).toEqual({ correo: "a@b.co" });
  });
});
