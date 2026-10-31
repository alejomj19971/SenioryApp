import { describe, expect, it } from "vitest";
import {
  ErrorDeApi,
  MENSAJE_GENERICO,
  MENSAJE_SERVICIO_CAIDO,
  MENSAJE_SIN_CONEXION,
  MENSAJE_TIEMPO_AGOTADO,
} from "@/lib/api/error-de-api";

function problema(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/problem+json" },
  });
}

describe("ErrorDeApi.desdeRespuesta", () => {
  it("lee un problem+json con errores por campo y el identificador de correlación", async () => {
    const error = await ErrorDeApi.desdeRespuesta(
      problema(400, {
        type: "urn:seniory:problema:validacion",
        title: "Los datos enviados no son válidos",
        status: 400,
        codigo: "validacion",
        idDeCorrelacion: "01a1-abc",
        errores: [
          { campo: "correo", mensaje: "El correo no es válido" },
          { campo: "contrasena", mensaje: "La contraseña debe tener entre 10 y 128 caracteres" },
        ],
      }),
    );

    expect(error).toBeInstanceOf(ErrorDeApi);
    expect(error).toMatchObject({
      estado: 400,
      codigo: "validacion",
      message: "Los datos enviados no son válidos",
      idDeCorrelacion: "01a1-abc",
    });
    expect(error.mensajeDelCampo("correo")).toBe("El correo no es válido");
    expect(error.mensajeDelCampo("nombre")).toBeUndefined();
  });

  it("prefiere el detalle sobre el título", async () => {
    const error = await ErrorDeApi.desdeRespuesta(
      problema(409, {
        title: "La operación no es posible en el estado actual",
        detail: "Ese correo ya está registrado",
        codigo: "usuario.correo_ya_registrado",
      }),
    );

    expect(error.message).toBe("Ese correo ya está registrado");
    expect(error.codigo).toBe("usuario.correo_ya_registrado");
  });

  it("ignora los errores por campo mal formados", async () => {
    const error = await ErrorDeApi.desdeRespuesta(
      problema(400, {
        codigo: "validacion",
        errores: [{ campo: "correo", mensaje: "ok" }, { campo: 3 }, "texto", null],
      }),
    );

    expect(error.errores).toEqual([{ campo: "correo", mensaje: "ok" }]);
  });

  it.each([502, 503, 504])("un %i con HTML del hosting usa el mensaje de servicio caído", async (estado) => {
    const error = await ErrorDeApi.desdeRespuesta(
      new Response("<html><body>Bad Gateway nginx/1.2</body></html>", {
        status: estado,
        headers: { "content-type": "text/html" },
      }),
    );

    expect(error).toMatchObject({
      estado,
      codigo: "servicio_no_disponible",
      message: MENSAJE_SERVICIO_CAIDO,
    });
    expect(error.message).not.toContain("nginx");
  });

  it("una respuesta que no es problem+json usa el mensaje genérico, sin copiar el cuerpo", async () => {
    const error = await ErrorDeApi.desdeRespuesta(
      new Response("Traza interna: password=abc", { status: 500 }),
    );

    expect(error).toMatchObject({ estado: 500, codigo: "error_desconocido", message: MENSAJE_GENERICO });
  });

  it.each([
    ["JSON roto", "{no es json"],
    ["sin código", JSON.stringify({ title: "algo" })],
    ["un arreglo", JSON.stringify([1, 2])],
    ["null", "null"],
  ])("un problem+json con %s usa el mensaje genérico", async (_caso, cuerpo) => {
    const error = await ErrorDeApi.desdeRespuesta(
      new Response(cuerpo, { status: 400, headers: { "content-type": "application/problem+json" } }),
    );

    expect(error).toMatchObject({ codigo: "error_desconocido", message: MENSAJE_GENERICO });
  });
});

describe("ErrorDeApi.deRed", () => {
  it("un error de red es «sin conexión»", () => {
    const error = ErrorDeApi.deRed(new TypeError("fetch failed"));

    expect(error).toMatchObject({
      estado: 0,
      codigo: "sin_conexion",
      message: MENSAJE_SIN_CONEXION,
    });
  });

  it.each(["TimeoutError", "AbortError"])("un %s es «tiempo agotado»", (nombre) => {
    const causa = new Error("se acabó el tiempo");
    causa.name = nombre;

    expect(ErrorDeApi.deRed(causa)).toMatchObject({
      codigo: "tiempo_agotado",
      message: MENSAJE_TIEMPO_AGOTADO,
    });
  });

  it("no copia el mensaje del error original (podría traer la dirección interna del servidor)", () => {
    const error = ErrorDeApi.deRed(new Error("connect ECONNREFUSED 10.0.0.5:3001"));

    expect(error.message).not.toContain("10.0.0.5");
  });
});
