import Link from "next/link";
import { Check, Clock, ShieldCheck, Star, MapPin } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { describirProximaDisponibilidad, proximaDisponibilidad } from "@/lib/disponibilidad";
import type { AhoraEnColombia } from "@/lib/fecha-colombia";
import type { CuidadorResumen } from "@/lib/types";
import { cn } from "@/lib/utils";
import { etiquetaEspecialidad, formatearCOP, formatearDistanciaKm } from "@/lib/format";

interface TarjetaCuidadorProps {
  cuidador: CuidadorResumen;
  // Para marcarlo y contratar a varios cuidadores juntos (el carrito, F4): la casilla no navega al perfil.
  seleccionado: boolean;
  onAlternarSeleccion: () => void;
  // Con la hora actual en Colombia, la tarjeta dice cuándo puede atender; sin ella no dice nada de eso.
  ahora?: AhoraEnColombia;
}

export function TarjetaCuidador({ cuidador, seleccionado, onAlternarSeleccion, ahora }: TarjetaCuidadorProps) {
  const disponibilidad = ahora === undefined ? null : describirProximaDisponibilidad(proximaDisponibilidad(cuidador.horariosLibres, ahora), ahora.hoy);
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
          "absolute top-3 right-3 z-10 flex size-7 items-center justify-center rounded-full ring-2 ring-background transition-colors",
          seleccionado ? "bg-primary text-primary-foreground" : "bg-card text-transparent ring-border hover:text-muted-foreground",
        )}
      >
        <Check className="size-4" aria-hidden="true" />
      </button>
      <Link href={`/app/cuidadores/${cuidador.id}`} className="flex flex-1 gap-3">
        <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" />
        <div className="flex flex-1 flex-col gap-1">
          {/* pr-8: deja libre la esquina superior derecha, donde está la casilla de selección */}
          <p className="pr-8 text-base font-semibold text-foreground">{cuidador.nombre}</p>
          <p className="text-sm text-muted-foreground">{etiquetaEspecialidad(cuidador.especialidad)}</p>
          {/* En su propia línea y pegada a la izquierda: así queda en el mismo lugar en todas las tarjetas, sin importar
              cuánto mida la especialidad. */}
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Verificado
          </span>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {cuidador.zona}
            {cuidador.distanciaKm !== null && <span className="font-medium text-foreground">· a {formatearDistanciaKm(cuidador.distanciaKm)}</span>}
          </div>
          {disponibilidad !== null && (
            <p className={cn("flex items-center gap-1 text-sm font-medium", disponibilidad.hoy ? "text-success" : "text-muted-foreground")}>
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              {disponibilidad.texto}
            </p>
          )}
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
