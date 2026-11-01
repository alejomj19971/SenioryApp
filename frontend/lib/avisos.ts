// Reglas puras de la campana (F5). Sin `server-only`: las usan el servidor y las pruebas.

// El backend NO guarda «leído» (no hay ruta para marcarlo), así que lo «nuevo» se decide en el dispositivo: la cookie
// guarda la hora del aviso más reciente que la persona ya vio. Es una comodidad de ESE dispositivo, no un dato del
// servidor.
export const COOKIE_DE_AVISOS_VISTOS = "seniory_avisos_vistos";

const FORMATO_DE_CURSOR = /^[A-Za-z0-9_-]{1,500}$/;
export const esCursorValido = (valor: unknown): valor is string => typeof valor === "string" && FORMATO_DE_CURSOR.test(valor);

// Una fecha ISO exacta (la que entrega el backend), nada más: lo que va a una cookie y a una comparación.
export function esFechaIso(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const fecha = new Date(valor);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString() === valor;
}

export function avisosNuevos<T extends { creadaEn: string }>(avisos: readonly T[], vistoHasta: string | undefined): T[] {
  if (vistoHasta === undefined || !esFechaIso(vistoHasta)) return [...avisos];
  return avisos.filter((aviso) => aviso.creadaEn > vistoHasta);
}

// A dónde lleva un aviso. `base` es de quién es la campana. Null si ese aviso no tiene pantalla en esa área (por
// ejemplo, la teleasistencia no existe en el área del cuidador): se muestra sin enlace.
export function destinoDelAviso(tipo: string, base: "/app" | "/cuidador"): string | null {
  const [evento] = tipo.split(":");
  switch (evento) {
    case "servicio_solicitado":
    case "servicio_confirmado":
    case "servicio_iniciado":
    case "servicio_finalizado":
    case "servicio_cancelado":
      return base === "/app" ? "/app/servicios" : "/cuidador";
    case "pago_requerido":
    case "pago_reembolsado":
    case "compra_de_bolsa_fallida":
    case "bolsa_comprada":
      return base === "/app" ? "/app/bolsa" : null;
    case "mensaje_nuevo":
      return `${base}/mensajes`;
    case "alerta_generada":
    case "medicamento_omitido":
    case "lectura_fuera_de_rango":
      return base === "/app" ? "/app/teleasistencia" : null;
    case "cuidador_verificado":
    case "verificacion_rechazada":
      return base === "/cuidador" ? "/cuidador" : null;
    default:
      return null;
  }
}
