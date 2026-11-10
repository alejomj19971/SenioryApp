import { afterEach, describe, expect, it, vi } from "vitest";

// El cierre para producción (F10 §7): robots, sitemap y las cabeceras de seguridad. Sin `server-only`: son
// configuración, no servicios con sesión.

afterEach(() => vi.unstubAllEnvs());

describe("robots.ts (F10): nada de /app, /cuidador, /admin ni /api en los buscadores", () => {
  it("permite el resto y apunta al sitemap", async () => {
    vi.stubEnv("URL_PUBLICA_DEL_SITIO", "https://seniory.co");
    const { default: robots } = await import("@/app/robots");

    const resultado = robots();

    expect(resultado).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/app", "/cuidador", "/admin", "/api"] },
      sitemap: "https://seniory.co/sitemap.xml",
    });
  });
});

describe("sitemap.ts (F10): solo lo público", () => {
  it("ninguna ruta protegida, y las direcciones son absolutas con la base configurada", async () => {
    vi.stubEnv("URL_PUBLICA_DEL_SITIO", "https://seniory.co");
    const { default: sitemap } = await import("@/app/sitemap");

    const rutas = sitemap().map((entrada) => entrada.url);

    expect(rutas).toEqual([
      "https://seniory.co/",
      "https://seniory.co/ingresar",
      "https://seniory.co/registro",
      "https://seniory.co/registro/cuidador",
      "https://seniory.co/privacidad",
      "https://seniory.co/terminos",
      "https://seniory.co/alcance-teleasistencia",
    ]);
    // «/registro/cuidador» sí es pública (postulación): solo importa el PRIMER tramo de la ruta.
    expect(rutas.some((url) => /^\/(app|cuidador|admin|api)(\/|$)/.test(new URL(url).pathname))).toBe(false);
  });
});

describe("next.config.ts (F10): cabeceras de seguridad en toda ruta", () => {
  it("manda una política de contenido coherente con el BFF (sin orígenes externos) y bloquea que la incrusten", async () => {
    const { default: config } = await import("@/next.config");
    const reglas = await config.headers?.();
    const cabeceras = Object.fromEntries((reglas?.[0]?.headers ?? []).map((c) => [c.key, c.value]));

    expect(reglas?.[0]?.source).toBe("/(.*)");
    expect(cabeceras["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(cabeceras["Content-Security-Policy"]).toContain("connect-src 'self'");
    expect(cabeceras["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    // Única excepción documentada: los tiles de OpenStreetMap del mapa (M2/F2). Cualquier otro dominio externo
    // en el CSP debe fallar esta prueba.
    const sinExcepcion = (cabeceras["Content-Security-Policy"] ?? "").replace("https://*.tile.openstreetmap.org", "");
    expect(sinExcepcion).not.toMatch(/https?:\/\//);
    expect(cabeceras["X-Frame-Options"]).toBe("DENY");
    expect(cabeceras["X-Content-Type-Options"]).toBe("nosniff");
    // El micrófono NO está vacío: el comando de voz lo necesita.
    expect(cabeceras["Permissions-Policy"]).toContain("microphone=(self)");
    expect(cabeceras["Permissions-Policy"]).toContain("camera=()");
  });
});
