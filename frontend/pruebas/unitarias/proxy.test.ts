// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Cuando un proxy pasa encabezados a la petición que continúa, Next los anuncia con estos encabezados
// internos de la respuesta.
const encabezadoDePeticion = (respuesta: Response, nombre: string) =>
  respuesta.headers.get(`x-middleware-request-${nombre}`);

describe("proxy", () => {
  it("le da a cada petición un identificador de correlación UUID, en los encabezados de la PETICIÓN", () => {
    const respuesta = proxy(new NextRequest("http://localhost:3000/app"));

    expect(encabezadoDePeticion(respuesta, "x-request-id")).toMatch(FORMATO_UUID);
    // No se expone en la respuesta al navegador.
    expect(respuesta.headers.get("x-request-id")).toBeNull();
  });

  it("cada petición recibe un identificador distinto", () => {
    const a = proxy(new NextRequest("http://localhost:3000/app"));
    const b = proxy(new NextRequest("http://localhost:3000/app"));

    expect(encabezadoDePeticion(a, "x-request-id")).not.toBe(encabezadoDePeticion(b, "x-request-id"));
  });

  it("no acepta un identificador que mande el cliente: lo reemplaza", () => {
    const respuesta = proxy(
      new NextRequest("http://localhost:3000/app", { headers: { "x-request-id": "inyectado" } }),
    );

    expect(encabezadoDePeticion(respuesta, "x-request-id")).toMatch(FORMATO_UUID);
  });

  it("deja pasar la petición: no redirige ni bloquea nada", () => {
    const respuesta = proxy(new NextRequest("http://localhost:3000/app/cuidadores"));

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("location")).toBeNull();
  });

  describe("matcher", () => {
    const patron = new RegExp(`^${(config.matcher[0] as string).replace(/^\//, "/")}$`);

    it.each(["/", "/app", "/app/cuidadores/c-marta-restrepo", "/ingresar"])("cubre %s", (ruta) => {
      expect(patron.test(ruta)).toBe(true);
    });

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
});
