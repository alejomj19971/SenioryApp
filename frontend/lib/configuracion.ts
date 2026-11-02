import "server-only";

// Configuración del BFF, leída de variables de entorno SIN `NEXT_PUBLIC_`: el navegador nunca las ve.
// Se leen cuando el primer código llama al backend; si falta una, el error dice cuál (F0 §4.3).

export class ErrorDeConfiguracion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeConfiguracion";
  }
}

const LARGO_MINIMO_DEL_SECRETO = 32;

function variable(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (valor === undefined || valor === "") {
    throw new ErrorDeConfiguracion(
      `Falta la variable de entorno ${nombre}. Copia .env.ejemplo a .env.local y complétala.`,
    );
  }
  return valor;
}

// Dirección de la API del backend, con su prefijo (por ejemplo, http://localhost:3001/api/v1).
export function urlDelBackend(): string {
  const valor = variable("SENIORY_API_URL");
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErrorDeConfiguracion(
      "SENIORY_API_URL no es una dirección válida (use el formato http://servidor:puerto/api/v1).",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErrorDeConfiguracion("SENIORY_API_URL debe empezar por http:// o https://.");
  }
  return valor.replace(/\/+$/, "");
}

// Secreto compartido con el backend (`SECRETO_BFF` allá): con él, el backend cree en la IP del navegador
// que le reenviamos y no en la de nuestros servidores. Nunca se escribe en un mensaje de error.
export function secretoBff(): string {
  const valor = variable("SENIORY_BFF_SECRETO");
  if (valor.length < LARGO_MINIMO_DEL_SECRETO) {
    throw new ErrorDeConfiguracion(
      `SENIORY_BFF_SECRETO debe tener al menos ${LARGO_MINIMO_DEL_SECRETO} caracteres.`,
    );
  }
  return valor;
}

// La dirección pública del propio sitio (para `robots.ts`, `sitemap.ts` y los enlaces absolutos de Open Graph). A
// diferencia de `urlDelBackend` y `secretoBff`, NO es de seguridad: si falta, se usa `localhost` y listo (F10 §7; el
// dominio definitivo es una decisión del hosting, documentada en PENDIENTES). `VERCEL_PROJECT_PRODUCTION_URL` la pone
// Vercel sola en cada despliegue; si se usa otro hosting, se define `URL_PUBLICA_DEL_SITIO` a mano.
export function urlPublicaDelSitio(): string {
  const explicita = process.env.URL_PUBLICA_DEL_SITIO?.trim();
  if (explicita !== undefined && explicita !== "") return explicita.replace(/\/+$/, "");
  const deVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (deVercel !== undefined && deVercel !== "") return `https://${deVercel}`;
  return "http://localhost:3000";
}

// Comprueba todo junto, para fallar al arrancar con TODOS los problemas y no uno por uno.
export function validarConfiguracion(): void {
  const problemas: string[] = [];
  for (const comprobar of [urlDelBackend, secretoBff]) {
    try {
      comprobar();
    } catch (error) {
      problemas.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problemas.length > 0) {
    throw new ErrorDeConfiguracion(
      `Configuración inválida. La aplicación no puede iniciar:\n${problemas.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
}
