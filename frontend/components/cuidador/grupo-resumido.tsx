"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ICONOS_DE_ESTADO } from "@/components/servicios/estado-del-servicio";
import { TarjetaDeSolicitud } from "@/components/cuidador/tarjeta-de-solicitud";
import { cn } from "@/lib/utils";
import type { EstadoDeServicio, ServicioDelCuidador } from "@/lib/types";

const COLOR_DE_BARRA: Record<string, string> = {
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
  secondary: "bg-muted-foreground/40",
};

// Lo que ya no necesita que el cuidador haga algo (a diferencia de "por responder" o "aceptado", que
// siempre se ven completos): colapsado por defecto, con el conteo a la vista, para no tapar lo que sí
// importa ahora mismo. Se expande con un toque.
export function GrupoResumido({
  titulo,
  estadoRepresentativo,
  variante,
  servicios,
}: {
  titulo: string;
  estadoRepresentativo: EstadoDeServicio;
  variante: "warning" | "success" | "info" | "secondary";
  servicios: ServicioDelCuidador[];
}) {
  const [abierto, setAbierto] = useState(false);
  const Icono = ICONOS_DE_ESTADO[estadoRepresentativo];
  if (servicios.length === 0) return null;

  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setAbierto((actual) => !actual)}
        aria-expanded={abierto}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card p-3 pr-4 ring-1 ring-border transition-colors hover:ring-primary/40"
      >
        <span className={cn("h-8 w-1 shrink-0 rounded-full", COLOR_DE_BARRA[variante])} aria-hidden="true" />
        <Icono className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-left text-base font-semibold text-foreground">{titulo}</span>
        <Badge variant={variante}>{servicios.length}</Badge>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="flex flex-col gap-3">
          {servicios.map((servicio) => (
            <TarjetaDeSolicitud key={servicio.id} servicio={servicio} />
          ))}
        </div>
      )}
    </section>
  );
}
