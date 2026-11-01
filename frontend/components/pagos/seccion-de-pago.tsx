import Link from "next/link";
import { CircleCheck, Clock, RotateCcw, TriangleAlert } from "lucide-react";
import { BotonPagar } from "@/components/pagos/boton-pagar";
import { Aviso } from "@/components/ui/aviso";
import { horaEnColombia } from "@/lib/fecha-colombia";
import { formatearCOP } from "@/lib/format";
import type { Pago, Servicio } from "@/lib/types";

// El pago de un servicio, dicho con palabras (nunca solo color): qué pasó, cuánto y qué hacer ahora. El estado sale
// del backend; el navegador no decide nunca que algo está pagado.
export function SeccionDePago({ servicio, pago }: { servicio: Servicio; pago: Pago | null }) {
  // Mientras nadie ha aceptado no hay cobro: lo dice la pantalla del servicio.
  if (servicio.estado === "solicitado") return null;
  // Un servicio cancelado sin pago (rechazado o vencido antes de aceptar) no tiene nada que contar.
  if (pago === null && servicio.estado === "cancelado") return null;

  if (pago === null) {
    return (
      <section aria-label="Pago" className="flex flex-col gap-2 rounded-2xl bg-info/10 p-4">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Clock className="size-5 shrink-0 text-info" aria-hidden="true" />
          Estamos preparando tu pago
        </p>
        <p className="text-base text-muted-foreground">Aparece aquí en unos segundos.</p>
        <Link href={`/app/servicios/${servicio.id}`} className="inline-flex min-h-12 w-fit items-center font-medium text-primary underline underline-offset-4">
          Actualizar
        </Link>
      </section>
    );
  }

  switch (pago.estado) {
    case "pendiente":
      return (
        <section aria-label="Pago" className="flex flex-col gap-3 rounded-2xl border border-warning bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
            Falta pagar {formatearCOP(pago.montoTotal)}
          </p>
          <p className="text-base text-foreground">
            El cuidador ya aceptó.
            {pago.venceEn !== null && <> Tienes hasta las <strong>{horaEnColombia(pago.venceEn)}</strong> para pagar; si no, el servicio se cancela.</>}
          </p>
          <BotonPagar pagoId={pago.id} />
        </section>
      );
    case "aprobado":
      return (
        <section aria-label="Pago" className="flex items-start gap-2 rounded-2xl border border-success bg-success/5 p-4">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <p className="text-base text-foreground">
            <strong>Pago recibido.</strong> {pago.medio === "bolsa" ? "Se descontó de tu bolsa de horas." : `Pagaste ${formatearCOP(pago.montoTotal)}.`}
          </p>
        </section>
      );
    case "reembolsado":
      return (
        <section aria-label="Pago" className="flex items-start gap-2 rounded-2xl border border-info bg-info/5 p-4">
          <RotateCcw className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
          <p className="text-base text-foreground">
            <strong>Te devolvimos el dinero.</strong> {pago.medio === "bolsa" ? "Volvió a tu bolsa de horas." : "Puede tardar unos días en verse en tu cuenta."}
          </p>
        </section>
      );
    case "rechazado":
    case "expirado":
      return (
        <section aria-label="Pago">
          <Aviso
            titulo={pago.estado === "expirado" ? "El pago venció" : "El pago no se completó"}
            descripcion="No se te cobró nada y el servicio se canceló. Puedes pedirlo de nuevo."
          />
        </section>
      );
  }
}
