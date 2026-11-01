import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatearCOP, formatearFechaHora } from "@/lib/format";
import { exigirRol } from "@/lib/sesion";
import { listarLiquidaciones } from "@/lib/services/pagos";
import type { Liquidacion } from "@/lib/types";

export const metadata: Metadata = { title: "Tus pagos" };

const ESTADOS: Record<Liquidacion["estado"], { texto: string; variante: "warning" | "info" | "success" | "destructive"; explicacion: string }> = {
  pendiente: { texto: "Por pagar", variante: "warning", explicacion: "Ya terminaste el servicio; te pagamos en la siguiente ronda." },
  enviada: { texto: "En camino", variante: "info", explicacion: "Ya enviamos el pago; puede tardar en verse en tu cuenta." },
  pagada: { texto: "Pagado", variante: "success", explicacion: "Te lo pagamos." },
  fallida: { texto: "No se pudo pagar", variante: "destructive", explicacion: "No pudimos hacerte este pago. Escríbenos para resolverlo." },
};

// Lo que se le debe (y lo que ya se le pagó) al cuidador. Un pago por servicio terminado, con el monto congelado al
// contratar. Solo cuenta lo que ÉL recibe: nunca lo que pagó la familia.
export default async function LiquidacionesPage() {
  await exigirRol("cuidador");
  const liquidaciones = await listarLiquidaciones();
  const porPagar = liquidaciones.filter((l) => l.estado === "pendiente" || l.estado === "enviada").reduce((suma, l) => suma + l.monto, 0);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Link href="/cuidador" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tu panel
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tus pagos</h1>
        <p className="text-base text-muted-foreground">Un pago por cada servicio que terminas.</p>
      </div>

      <section aria-label="Por recibir" className="flex flex-col gap-1 rounded-2xl bg-primary p-5 text-primary-foreground">
        <p className="flex items-center gap-2 text-base">
          <Banknote className="size-5" aria-hidden="true" />
          Por recibir
        </p>
        <p className="text-4xl font-extrabold">{formatearCOP(porPagar)}</p>
      </section>

      {liquidaciones.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {liquidaciones.map((liquidacion) => {
            const estado = ESTADOS[liquidacion.estado];
            return (
              <li key={liquidacion.id} className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-bold text-foreground">{formatearCOP(liquidacion.monto)}</p>
                  <Badge variant={estado.variante}>{estado.texto}</Badge>
                </div>
                <p className="text-base text-muted-foreground">{estado.explicacion}</p>
                <p className="text-sm text-muted-foreground">
                  {liquidacion.pagadaEn !== null ? `Pagado el ${formatearFechaHora(liquidacion.pagadaEn)}` : `Servicio terminado el ${formatearFechaHora(liquidacion.creadaEn)}`}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl bg-muted p-6 text-center text-base text-muted-foreground">
          Todavía no tienes pagos. Aparecen aquí cuando terminas tu primer servicio.
        </p>
      )}
    </div>
  );
}
