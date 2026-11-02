import { CircleCheck, Clock, ShieldAlert } from "lucide-react";
import { BotonDeRenovacion } from "@/components/postulacion/acciones-de-postulacion";
import { Badge } from "@/components/ui/badge";
import { ESTADO_DEL_CONTROL, NOMBRE_DEL_CONTROL } from "@/lib/etiquetas-de-postulacion";
import { formatearDiaCivilConAnio } from "@/lib/format";
import type { ControlDelCuidador } from "@/lib/types";

// Los tres controles que hacen visible a un cuidador (antecedentes, títulos y psicotécnica) y cómo va cada uno. Un
// control rechazado muestra el motivo (lo único que necesita para corregirlo); uno vencido o rechazado se renueva
// subiendo un documento nuevo y pidiendo la revisión.
export function EstadoDeControles({ controles }: { controles: ControlDelCuidador[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {controles.map((control) => {
        const estado = ESTADO_DEL_CONTROL[control.estado];
        const nombre = NOMBRE_DEL_CONTROL[control.control];
        return (
          <li key={control.control} className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-foreground">{nombre}</p>
              <Badge variant={estado.variante}>{estado.texto}</Badge>
            </div>
            {control.estado === "aprobada" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleCheck className="size-4 text-success" aria-hidden="true" />
                {control.vigenteHasta === null ? "No vence." : `Vigente hasta el ${formatearDiaCivilConAnio(control.vigenteHasta)}.`}
              </p>
            )}
            {control.estado === "pendiente" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" aria-hidden="true" />
                Un revisor lo está mirando.
              </p>
            )}
            {control.estado === "rechazada" && control.motivoDeRechazo !== null && (
              <p className="flex items-start gap-2 text-sm text-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <span>
                  <strong>Motivo:</strong> {control.motivoDeRechazo}
                </span>
              </p>
            )}
            {control.estado === "vencida" && (
              <p className="flex items-center gap-2 text-sm text-foreground">
                <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                Venció. Mientras no lo renueves, no apareces en la búsqueda.
              </p>
            )}
            {control.puedeRenovar && <BotonDeRenovacion control={control.control} nombre={nombre.toLowerCase()} />}
          </li>
        );
      })}
    </ul>
  );
}
