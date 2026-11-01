import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CircleCheck, Clock, Star, UserRound, Wallet } from "lucide-react";
import { ResumenCosto } from "@/components/contratacion/resumen-costo";
import { CalificarServicio, CancelarServicio } from "@/components/servicios/acciones-de-servicio-familia";
import { EstadoDelServicio } from "@/components/servicios/estado-del-servicio";
import { etiquetaDeEstadoParaLaFamilia } from "@/lib/etiquetas-de-servicio";
import { horaEnColombia } from "@/lib/fecha-colombia";
import { etiquetaJornada, formatearDiaCivil } from "@/lib/format";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { obtenerServicio } from "@/lib/services/servicios";

export const metadata = {
  title: "Servicio",
};

export default async function ServicioPage({ params, searchParams }: PageProps<"/app/servicios/[id]">) {
  const { id } = await params;
  const nuevo = (await searchParams).nuevo === "1";
  await exigirFamiliaLista();
  const servicio = await obtenerServicio(id);
  if (!servicio) notFound();

  const etiqueta = etiquetaDeEstadoParaLaFamilia(servicio.estado, servicio.motivoDeCancelacion);
  const porcentaje = servicio.subtotal === 0 ? 0 : Math.round((servicio.cargoDeServicio / servicio.subtotal) * 1000) / 10;
  const puedeCancelar = servicio.estado === "solicitado" || servicio.estado === "aceptado";

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Link href="/app/servicios" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Mis servicios
      </Link>

      {nuevo && servicio.estado === "solicitado" && (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-success bg-success/5 p-4 text-base text-foreground">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <span>
            <strong>¡Solicitud enviada!</strong> Le avisamos a {servicio.cuidador?.nombre.split(" ")[0] ?? "el cuidador"}. Te avisamos apenas responda.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-foreground">Tu servicio</h1>
          <EstadoDelServicio estado={servicio.estado} etiqueta={etiqueta} />
        </div>
        <p className="text-base text-muted-foreground">{etiqueta.explicacion}</p>
        {servicio.estado === "solicitado" && servicio.solicitudExpiraEn !== null && (
          <p className="text-base text-foreground">
            Tiene hasta las <strong>{horaEnColombia(servicio.solicitudExpiraEn)}</strong> para responder.
          </p>
        )}
      </div>

      <section aria-label="Detalle del servicio" className="flex flex-col gap-3 rounded-2xl bg-muted p-4 text-base text-foreground">
        {servicio.cuidador !== null && (
          <p className="flex items-center gap-2">
            <UserRound className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <Link href={`/app/cuidadores/${servicio.cuidador.id}`} className="font-medium underline underline-offset-4">
              {servicio.cuidador.nombre}
            </Link>
          </p>
        )}
        {servicio.adultoMayor !== null && (
          <p className="text-muted-foreground">Para {servicio.adultoMayor.nombre}</p>
        )}
        <p className="flex items-center gap-2">
          <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="first-letter:uppercase">{formatearDiaCivil(servicio.fecha)}</span>
        </p>
        <p className="flex items-center gap-2">
          <Clock className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {etiquetaJornada(servicio.jornada)} · {servicio.horas} {servicio.horas === 1 ? "hora" : "horas"}
        </p>
        <p className="flex items-center gap-2">
          <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {servicio.medioDePago === "bolsa" ? "Se paga con tu bolsa de horas" : "Se paga en línea cuando el cuidador acepte"}
        </p>
      </section>

      <ResumenCosto subtotal={servicio.subtotal} cargo={servicio.cargoDeServicio} cargoPorcentaje={porcentaje} total={servicio.totalFamilia} />

      {servicio.calificacion !== null && (
        <section className="flex flex-col gap-1 rounded-2xl bg-card p-4 ring-1 ring-border">
          <h2 className="text-lg font-semibold text-foreground">Tu calificación</h2>
          <p className="flex items-center gap-1 text-base text-foreground">
            <Star className="size-5 fill-warning text-warning" aria-hidden="true" />
            {servicio.calificacion.calificacion} de 5
          </p>
          {servicio.calificacion.comentario !== "" && <p className="text-base text-muted-foreground">{servicio.calificacion.comentario}</p>}
        </section>
      )}

      {servicio.estado === "finalizado" && servicio.calificacion === null && <CalificarServicio servicioId={servicio.id} />}
      {puedeCancelar && <CancelarServicio servicioId={servicio.id} yaSeCobro={servicio.estado === "aceptado"} />}
    </div>
  );
}
