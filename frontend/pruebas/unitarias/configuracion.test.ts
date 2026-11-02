import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ErrorDeConfiguracion,
  secretoBff,
  urlDelBackend,
  urlPublicaDelSitio,
  validarConfiguracion,
} from "@/lib/configuracion";

const SECRETO = "s".repeat(32);

afterEach(() => vi.unstubAllEnvs());

describe("urlDelBackend", () => {
  it("devuelve la dirección sin la barra final", () => {
    vi.stubEnv("SENIORY_API_URL", "http://localhost:3001/api/v1/");

    expect(urlDelBackend()).toBe("http://localhost:3001/api/v1");
  });

  it.each([undefined, "", "   "])("con %j dice qué variable falta", (valor) => {
    vi.stubEnv("SENIORY_API_URL", valor as string);

    expect(() => urlDelBackend()).toThrow(
      expect.objectContaining({
        constructor: ErrorDeConfiguracion,
        message: expect.stringContaining("SENIORY_API_URL"),
      }),
    );
  });

  it.each(["localhost:3001", "no es una url", "ftp://servidor/api"])(
    "rechaza «%s»",
    (valor) => {
      vi.stubEnv("SENIORY_API_URL", valor);

      expect(() => urlDelBackend()).toThrow(ErrorDeConfiguracion);
    },
  );
});

describe("secretoBff", () => {
  it("devuelve el secreto", () => {
    vi.stubEnv("SENIORY_BFF_SECRETO", SECRETO);

    expect(secretoBff()).toBe(SECRETO);
  });

  it("con la variable ausente dice cuál falta", () => {
    vi.stubEnv("SENIORY_BFF_SECRETO", "");

    expect(() => secretoBff()).toThrow(/SENIORY_BFF_SECRETO/);
  });

  it("rechaza un secreto corto, y el mensaje nunca lo incluye", () => {
    vi.stubEnv("SENIORY_BFF_SECRETO", "corto-pero-secreto");

    expect(() => secretoBff()).toThrow(/al menos 32/);
    expect(() => secretoBff()).not.toThrow(/corto-pero-secreto/);
  });
});

describe("urlPublicaDelSitio (F10: robots.txt, sitemap.xml y metadataBase, nunca de seguridad)", () => {
  it("usa la variable explícita, sin la barra final", () => {
    vi.stubEnv("URL_PUBLICA_DEL_SITIO", "https://seniory.co/");

    expect(urlPublicaDelSitio()).toBe("https://seniory.co");
  });

  it("sin ella, usa la que Vercel pone sola en cada despliegue", () => {
    vi.stubEnv("URL_PUBLICA_DEL_SITIO", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "seniory.vercel.app");

    expect(urlPublicaDelSitio()).toBe("https://seniory.vercel.app");
  });

  it("sin ninguna, nunca lanza: cae a localhost", () => {
    vi.stubEnv("URL_PUBLICA_DEL_SITIO", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");

    expect(urlPublicaDelSitio()).toBe("http://localhost:3000");
  });
});

describe("validarConfiguracion", () => {
  it("no lanza con todo bien", () => {
    vi.stubEnv("SENIORY_API_URL", "http://localhost:3001/api/v1");
    vi.stubEnv("SENIORY_BFF_SECRETO", SECRETO);

    expect(() => validarConfiguracion()).not.toThrow();
  });

  it("informa TODOS los problemas a la vez", () => {
    vi.stubEnv("SENIORY_API_URL", "");
    vi.stubEnv("SENIORY_BFF_SECRETO", "");

    expect(() => validarConfiguracion()).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/SENIORY_API_URL[\s\S]*SENIORY_BFF_SECRETO/),
      }),
    );
  });
});
