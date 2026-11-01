import { CalendarDays, Clock, UserRound } from "lucide-react";
import { AccionesDelServicio } from "@/components/cuidador/acciones-del-servicio";
import { EstadoDelServicio } from "@/components/servicios/estado-del-servicio";
import { horaEnColombia } from "@/lib/fecha-colombia";
import { etiquetaDeEstadoParaElCuidador } from "@/lib/etiquetas-de-servicio";
import { etiquetaJornada, formatearCOP, formatearDiaCivil } from "@/lib/format";
import type { ServicioDelCuidador } from "@/lib/types";

// Un servicio visto por el cuidador: lo que RECIBE (nunca lo que paga la familia) y qué puede hacer ahora.
export function TarjetaDeSolicitud({ servicio }: { servicio: ServicioDelCuidador }) {
  const etiqueta = etiquetaDeEstadoParaElCuidador(servicio.estado, servicio.motivoDeCancelacion);
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border" aria-label={`Servicio del ${formatearDiaCivil(servicio.fecha)}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <UserRound className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {servicio.adultoMayor === null ? "Persona a cuidar" : `${servicio.adultoMayor.nombre}, ${servicio.adultoMayor.edad} años`}
        </p>
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
      <p className="text-lg font-bold text-foreground">
        Recibes {formatearCOP(servicio.pagoProfesional)}
      </p>
      <p className="text-base text-muted-foreground">{etiqueta.explicacion}</p>
      {servicio.estado === "solicitado" && servicio.solicitudExpiraEn !== null && (
        <p className="text-base font-medium text-foreground">Responde antes de las {horaEnColombia(servicio.solicitudExpiraEn)}.</p>
      )}
      <AccionesDelServicio servicioId={servicio.id} estado={servicio.estado} />
    </article>
  );
}
