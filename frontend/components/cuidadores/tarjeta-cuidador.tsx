import Link from "next/link";
import { Check, ShieldCheck, Star, MapPin } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import type { CuidadorResumen } from "@/lib/types";
import { cn } from "@/lib/utils";
import { etiquetaEspecialidad, formatearCOP, formatearDistanciaKm } from "@/lib/format";

interface TarjetaCuidadorProps {
  cuidador: CuidadorResumen;
  // Para marcarlo y contratar a varios cuidadores juntos (el carrito, F4): la casilla no navega al perfil.
  seleccionado: boolean;
  onAlternarSeleccion: () => void;
}

export function TarjetaCuidador({ cuidador, seleccionado, onAlternarSeleccion }: TarjetaCuidadorProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 ease-out relative flex gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:ring-primary/40">
      <button
        type="button"
        onClick={(evento) => {
          evento.preventDefault();
          evento.stopPropagation();
          onAlternarSeleccion();
        }}
        aria-pressed={seleccionado}
        aria-label={seleccionado ? `Quitar a ${cuidador.nombre} de la selección` : `Seleccionar a ${cuidador.nombre} para contratar junto con otros`}
        className={cn(
          "absolute top-3 left-3 z-10 flex size-7 items-center justify-center rounded-full ring-2 ring-background transition-colors",
          seleccionado ? "bg-primary text-primary-foreground" : "bg-card text-transparent ring-border hover:text-muted-foreground",
        )}
      >
        <Check className="size-4" aria-hidden="true" />
      </button>
      <Link href={`/app/cuidadores/${cuidador.id}`} className="flex flex-1 gap-3">
        <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold text-foreground">{cuidador.nombre}</p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
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
            {cuidador.distanciaKm !== null && <span className="font-medium text-foreground">· a {formatearDistanciaKm(cuidador.distanciaKm)}</span>}
          </div>
          <div className="mt-1 flex items-center justify-between">
            {cuidador.calificacion !== null ? (
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                {cuidador.calificacion.toFixed(1)}
                <span className="font-normal text-muted-foreground">({cuidador.cantidadResenas})</span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Sin reseñas todavía</span>
            )}
            <span className="text-lg font-bold text-foreground">
              {formatearCOP(cuidador.tarifaHora)}
              <span className="text-xs font-normal text-muted-foreground">/hora</span>
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
