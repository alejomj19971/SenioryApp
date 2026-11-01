import { CalendarCheck, CircleCheck, CircleX, Clock, HeartHandshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EtiquetaDeEstado } from "@/lib/etiquetas-de-servicio";
import type { EstadoDeServicio } from "@/lib/types";

const ICONOS: Record<EstadoDeServicio, typeof Clock> = {
  solicitado: Clock,
  aceptado: CalendarCheck,
  en_curso: HeartHandshake,
  finalizado: CircleCheck,
  cancelado: CircleX,
};

// El estado de un servicio como etiqueta con ícono y texto (nunca solo color).
export function EstadoDelServicio({ estado, etiqueta }: { estado: EstadoDeServicio; etiqueta: EtiquetaDeEstado }) {
  const Icono = ICONOS[estado];
  return (
    <Badge variant={etiqueta.variante}>
      <Icono aria-hidden="true" />
      {etiqueta.texto}
    </Badge>
  );
}
