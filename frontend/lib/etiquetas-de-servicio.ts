import type { EstadoDeServicio, MotivoDeCancelacion } from "@/lib/types";

// Cómo se dice cada estado de un servicio. Sin `server-only`: lo usan páginas y componentes cliente.

export interface EtiquetaDeEstado {
  texto: string;
  // Variante del `Badge` (siempre con ícono y texto: el color nunca es la única señal).
  variante: "warning" | "success" | "info" | "secondary";
  // Qué significa para quien mira, en una frase.
  explicacion: string;
}

export function etiquetaDeEstadoParaLaFamilia(estado: EstadoDeServicio, motivo: MotivoDeCancelacion | null): EtiquetaDeEstado {
  switch (estado) {
    case "solicitado":
      return { texto: "Esperando al cuidador", variante: "warning", explicacion: "Le avisamos al cuidador. Te avisamos apenas responda; no se cobra nada hasta que acepte." };
    case "aceptado":
      return { texto: "Confirmado", variante: "success", explicacion: "El cuidador aceptó. Llegará en la franja que elegiste." };
    case "en_curso":
      return { texto: "En curso", variante: "info", explicacion: "El cuidador ya está con la persona." };
    case "finalizado":
      return { texto: "Terminado", variante: "secondary", explicacion: "El servicio terminó." };
    case "cancelado":
      return { texto: "Cancelado", variante: "secondary", explicacion: explicacionDeCancelacion(motivo) };
  }
}

export function explicacionDeCancelacion(motivo: MotivoDeCancelacion | null): string {
  switch (motivo) {
    case "rechazada":
      return "El cuidador no pudo tomar este servicio. No se te cobró nada: puedes elegir a otra persona.";
    case "expirada":
      return "El cuidador no alcanzó a responder a tiempo. No se te cobró nada: puedes elegir a otra persona.";
    case "cancelada_por_familia":
      return "Lo cancelaste tú. Si ya se había cobrado, el dinero vuelve.";
    case "pago_fallido":
      return "El pago no se completó a tiempo, así que se canceló el servicio.";
    default:
      return "El servicio se canceló.";
  }
}

export function etiquetaDeEstadoParaElCuidador(estado: EstadoDeServicio, motivo: MotivoDeCancelacion | null): EtiquetaDeEstado {
  switch (estado) {
    case "solicitado":
      return { texto: "Por responder", variante: "warning", explicacion: "Una familia te lo pidió. Acéptalo o recházalo antes de que venza." };
    case "aceptado":
      return { texto: "Aceptado", variante: "success", explicacion: "Marca que iniciaste cuando llegues (hasta 30 minutos antes de la franja)." };
    case "en_curso":
      return { texto: "En curso", variante: "info", explicacion: "Marca que finalizaste cuando termines." };
    case "finalizado":
      return { texto: "Terminado", variante: "secondary", explicacion: "Servicio terminado." };
    case "cancelado":
      return {
        texto: "Cancelado",
        variante: "secondary",
        explicacion:
          motivo === "rechazada"
            ? "Lo rechazaste."
            : motivo === "expirada"
              ? "Venció sin respuesta."
              : motivo === "pago_fallido"
                ? "La familia no completó el pago."
                : "La familia lo canceló.",
      };
  }
}
