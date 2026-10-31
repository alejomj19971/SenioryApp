import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Regla de capas (ADR-01 §4.7, ADR-02 §5 y F0 §6): las pantallas hablan solo con `lib/services`, nunca
// con los datos ni con el cliente HTTP, y un componente cliente nunca importa un servicio (que es solo
// de servidor: empaquetaría los datos al navegador).

const RAIZ = process.cwd();

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

function importaciones(codigo: string): string[] {
  return [...codigo.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);
}

const nombre = (ruta: string) => relative(RAIZ, ruta).replaceAll("\\", "/");
const pantallas = [...archivos(join(RAIZ, "app")), ...archivos(join(RAIZ, "components"))];

describe("regla de capas del frontend", () => {
  it("encuentra las pantallas y los componentes (la prueba no está vacía)", () => {
    expect(pantallas.length).toBeGreaterThan(40);
  });

  it("ningún archivo de app/ o components/ importa los datos ni el cliente HTTP", () => {
    const infractores = pantallas.flatMap((ruta) =>
      importaciones(readFileSync(ruta, "utf8"))
        .filter((destino) => destino.startsWith("@/data") || destino.startsWith("@/lib/api"))
        .map((destino) => `${nombre(ruta)} importa ${destino}`),
    );

    expect(infractores).toEqual([]);
  });

  it("ningún componente cliente importa un servicio ni un módulo de servidor", () => {
    const infractores = pantallas
      .filter((ruta) => /^\s*["']use client["']/.test(readFileSync(ruta, "utf8")))
      .flatMap((ruta) =>
        importaciones(readFileSync(ruta, "utf8"))
          .filter(
            (destino) =>
              destino.startsWith("@/lib/services") ||
              destino.startsWith("@/lib/sesion") ||
              destino === "@/lib/configuracion",
          )
          .map((destino) => `${nombre(ruta)} importa ${destino}`),
      );

    expect(infractores).toEqual([]);
  });

  it("todos los servicios de lib/services son solo de servidor", () => {
    const sinMarca = archivos(join(RAIZ, "lib", "services"))
      .filter((ruta) => !/^\s*import\s+["']server-only["']/.test(readFileSync(ruta, "utf8")))
      .map(nombre);

    expect(sinMarca).toEqual([]);
  });

  it("los módulos de servidor de lib/api, lib/sesion y la configuración también llevan la marca", () => {
    const carpetas = ["api", "sesion"].map((c) => join(RAIZ, "lib", c));
    const rutas = [
      ...carpetas.flatMap((c) => {
        try {
          return archivos(c);
        } catch {
          return []; // todavía no existe (llega con F0 PR 4 y F1)
        }
      }),
      ...["configuracion.ts"].map((f) => join(RAIZ, "lib", f)),
    ].filter((ruta) => {
      try {
        return statSync(ruta).isFile() && !ruta.endsWith("error-de-api.ts");
      } catch {
        return false;
      }
    });

    const sinMarca = rutas
      .filter((ruta) => !/^\s*import\s+["']server-only["']/.test(readFileSync(ruta, "utf8")))
      .map(nombre);

    expect(sinMarca).toEqual([]);
  });
});
