import { ErrorDeApi } from "@/lib/api/error-de-api";

// Del error del backend al mensaje que ve la persona al pedir o atender un servicio. Sin `server-only`: es una
// función pura. Los mensajes del backend ya vienen en español; aquí se reemplazan los que conviene decir con otras
// palabras y los que dependen de a dónde puede ir la persona después.

const MENSAJES_POR_CODIGO: Record<string, string> = {
  "servicio.franja_ocupada": "Ese cuidador ya tiene un servicio en ese horario. Elige otra franja u otro día.",
  "servicio.jornada_no_disponible": "Ese cuidador no atiende en esa franja. Elige otra.",
  "servicio.franja_terminada": "Esa franja de hoy ya terminó. Elige otra o pide el servicio para mañana.",
  "servicio.fecha_pasada": "La fecha ya pasó. Elige hoy o un día futuro.",
  "servicio.fecha_muy_lejana": "Solo se puede pedir con hasta 6 meses de anticipación.",
  "servicio.sin_consentimiento": "Falta la autorización para tratar los datos de salud de la persona. Complétala en tu cuenta.",
  "bolsa.saldo_insuficiente": "Tu bolsa no alcanza para este servicio. Paga con tarjeta o compra más horas.",
  "servicio.pago_pendiente": "El servicio todavía no tiene el pago aprobado, así que no puede empezar.",
  "servicio.solicitud_expirada": "La solicitud ya venció: pasó el plazo para responderla.",
  "servicio.fuera_de_la_franja": "Todavía no es la hora de este servicio: se puede iniciar hasta 30 minutos antes de su franja.",
  "servicio.clave_reutilizada": "Esa solicitud ya se había enviado con otros datos. Vuelve a intentarlo.",
};

export const MENSAJE_DEMASIADAS_SOLICITUDES = "Hiciste demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.";

export function mensajeDeErrorDeServicio(error: ErrorDeApi): string {
  if (error.estado === 429) return MENSAJE_DEMASIADAS_SOLICITUDES;
  // Todavía no hay pasarela de pagos (o el almacén de archivos): se dice, no se finge.
  if (error.estado === 503 && error.codigo !== "servicio_no_disponible") return "Esto no está disponible por ahora. Inténtalo de nuevo más tarde.";
  const mensaje = MENSAJES_POR_CODIGO[error.codigo];
  if (mensaje !== undefined) return mensaje;
  // Un servicio que no existe o no es de esta persona (404) y lo que no se puede en este estado (409) llegan con su
  // propio texto en español; un 5xx o una falla de red ya traen el mensaje de «inténtalo de nuevo».
  if (error.estado === 404) return "No encontramos ese servicio.";
  return error.message;
}
