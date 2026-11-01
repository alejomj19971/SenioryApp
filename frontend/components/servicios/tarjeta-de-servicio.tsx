import Link from "next/link";
import { CalendarDays, ChevronRight, Clock } from "lucide-react";
import { EstadoDelServicio } from "@/components/servicios/estado-del-servicio";
import { etiquetaDeEstadoParaLaFamilia } from "@/lib/etiquetas-de-servicio";
import { etiquetaJornada, formatearCOP, formatearDiaCivil } from "@/lib/format";
import type { Servicio } from "@/lib/types";

export function TarjetaDeServicio({ servicio }: { servicio: Servicio }) {
  const etiqueta = etiquetaDeEstadoParaLaFamilia(servicio.estado, servicio.motivoDeCancelacion);
  return (
    <Link
      href={`/app/servicios/${servicio.id}`}
      className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-foreground">{servicio.cuidador?.nombre ?? "Cuidador"}</p>
        <EstadoDelServicio estado={servicio.estado} etiqueta={etiqueta} />
      </div>
      <div className="flex flex-col gap-1 text-base text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          <span className="first-letter:uppercase">{formatearDiaCivil(servicio.fecha)}</span>
        </span>
        <span className="flex items-center gap-2">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {etiquetaJornada(servicio.jornada)} · {servicio.horas} {servicio.horas === 1 ? "hora" : "horas"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-foreground">{formatearCOP(servicio.totalFamilia)}</span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
    </Link>
  );
}
