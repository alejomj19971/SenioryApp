// A dónde va una persona después de ingresar. Sin `server-only`: son funciones puras.

// `volver` viene de la URL, así que cualquiera puede escribirlo: solo se acepta una ruta DE ESTE SITIO
// (empieza por una sola «/»). Con «//otro.com», «https://otro.com» o «/\otro.com» se ignora.
export function rutaInternaSegura(volver: string | null | undefined): string | null {
  if (typeof volver !== "string" || volver === "") return null;
  if (!volver.startsWith("/") || volver.startsWith("//") || volver.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(volver)) return null;
  return volver;
}

export interface DatosParaElDestino {
  rol: "familiar" | "adulto_mayor" | "cuidador" | "administrador";
  adultosMayores: { consentimientoDeSalud: boolean }[];
}

// Familia: primero la persona a cuidar, luego el consentimiento de salud; después, `volver` o el inicio.
// Cuidador y administrador tienen su propia área.
export function destinoTrasIngresar(datos: DatosParaElDestino, volver?: string | null): string {
  if (datos.rol === "cuidador") return "/cuidador";
  if (datos.rol === "administrador") return "/admin";
  if (datos.rol === "familiar") {
    if (datos.adultosMayores.length === 0) return "/bienvenida/persona";
    if (!datos.adultosMayores.some((persona) => persona.consentimientoDeSalud)) {
      return "/bienvenida/consentimiento";
    }
  }
  return rutaInternaSegura(volver) ?? "/app";
}
