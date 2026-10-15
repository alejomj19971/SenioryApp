"use client";

import Link from "next/link";
import { CheckCircle2, HeartPulse, CalendarDays, Clock } from "lucide-react";
import { useContratacion } from "@/components/contratacion/contratacion-provider";
import { ResumenCosto } from "@/components/contratacion/resumen-costo";
import { buttonVariants } from "@/components/ui/button";
import { etiquetaJornada, formatearFecha } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ConfirmacionPage() {
  const { contratacionActual } = useContratacion();

  if (!contratacionActual) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="text-lg font-medium text-foreground">
          Todavía no tienes ninguna contratación en curso.
        </p>
        <Link
          href="/app/cuidadores"
          className={cn(buttonVariants({ className: "h-12 rounded-full px-6" }))}
        >
          Buscar un cuidador
        </Link>
      </div>
    );
  }

  const { cuidadorNombre, fecha, jornada, horas, resumen } = contratacionActual;

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10 text-center">
      <span className="relative flex size-24 items-center justify-center rounded-full bg-primary/10 p-3 ring-8 ring-primary/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.png" alt="" className="size-full object-contain" />
        <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background">
          <CheckCircle2 className="size-4" aria-hidden="true" />
        </span>
      </span>
      <div>
        <h1 className="text-2xl font-bold text-foreground">¡Contratación confirmada!</h1>
        <p className="mt-1 text-base text-muted-foreground">
          {cuidadorNombre} llegará según lo agendado.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3 rounded-2xl bg-muted p-4 text-left">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {formatearFecha(fecha)}
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {etiquetaJornada(jornada)} · {horas} {horas === 1 ? "hora" : "horas"}
        </div>
      </div>

      <div className="w-full text-left">
        <ResumenCosto resumen={resumen} />
      </div>

      <Link
        href="/app/teleasistencia"
        className={cn(
          buttonVariants({ className: "h-14 w-full rounded-full text-base shadow-lg shadow-primary/25" }),
        )}
      >
        <HeartPulse className="size-5" aria-hidden="true" />
        Ir a Teleasistencia
      </Link>
      <Link href="/app" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        Volver al inicio
      </Link>
    </div>
  );
}
