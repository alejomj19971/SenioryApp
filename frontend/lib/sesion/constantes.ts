// Nombres de las cookies de sesión. Sin `server-only`: también las lee `proxy.ts`.
export const COOKIE_DE_ACCESO = "seniory_acceso";
export const COOKIE_DE_REFRESCO = "seniory_refresco";

// Si el acceso vence en menos de este tiempo, `proxy.ts` lo renueva antes de que la persona lo note.
export const MARGEN_DE_RENOVACION_SEGUNDOS = 60;

export const RUTA_DE_INGRESO = "/ingresar";
export const RUTA_DE_INICIO = "/app";
