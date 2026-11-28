"use client";

import { useActionState } from "react";
import { CalendarClock, CreditCard, ShieldCheck, Siren, XCircle } from "lucide-react";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { aceptarReglasDelNegocio } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

// Las reglas del negocio, en frases cortas, al final de la bienvenida (M1). Un solo lugar y una sola vez: nadie
// más en la aplicación explica esto, así que cubre todo lo que de verdad hace falta saber antes de contratar.
export function FormularioReglas() {
  const [estado, accion, pendiente] = useActionState(aceptarReglasDelNegocio, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-6">
      <ResumenDelFormulario estado={estado} />
      <ul className="flex flex-col gap-4 text-base">
        <li className="flex gap-3">
          <CalendarClock className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>Cómo contratas:</strong> por jornada (mañana, tarde o noche), no por una hora exacta. La hora de llegada la acuerdas con el cuidador por el chat.
          </span>
        </li>
        <li className="flex gap-3">
          <CreditCard className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>Cuándo se paga:</strong> cuando el cuidador acepta, antes de que empiece. Tu dinero queda reservado: el cuidador lo recibe al terminar el servicio, y si no se presta, te lo devolvemos.
          </span>
        </li>
        <li className="flex gap-3">
          <XCircle className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>Si necesitas cancelar:</strong> es gratis hasta 2 horas antes de que empiece. Más tarde, la mitad se le paga al cuidador como compensación y la otra mitad te la devolvemos.
          </span>
        </li>
        <li className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>Si el cuidador cancela o no llega:</strong> te avisamos y te devolvemos todo lo pagado. Todos los cuidadores pasan por una revisión de documentos antes de aparecer en el directorio, y seguimos vigilando que sigan vigentes.
          </span>
        </li>
        <li className="flex gap-3">
          <Siren className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>El botón de ayuda:</strong> avisa a la familia y al cuidador en turno. Seniory no es un servicio de emergencias: si hay peligro real, llama al{" "}
            <a href="tel:123" className="font-semibold text-foreground underline underline-offset-4">
              123
            </a>
            .
          </span>
        </li>
      </ul>

      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Entendido, continuar"}
      </Button>
    </form>
  );
}
