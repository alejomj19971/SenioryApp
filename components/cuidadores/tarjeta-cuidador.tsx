import Link from "next/link";
import { ShieldCheck, Star, MapPin } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import type { Cuidador } from "@/lib/types";
import { etiquetaEspecialidad, formatearCOP } from "@/lib/format";

export function TarjetaCuidador({ cuidador }: { cuidador: Cuidador }) {
  return (
    <Link
      href={`/app/cuidadores/${cuidador.id}`}
      className="flex gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:ring-primary/40"
    >
      <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold text-foreground">{cuidador.nombre}</p>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Verificado
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {etiquetaEspecialidad(cuidador.especialidad)}
        </p>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {cuidador.zona}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
            <Star className="size-4 fill-accent text-accent" aria-hidden="true" />
            {cuidador.calificacion.toFixed(1)}
          </span>
          <span className="text-base font-bold text-foreground">
            {formatearCOP(cuidador.tarifaHora)}
            <span className="text-xs font-normal text-muted-foreground">/hora</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
