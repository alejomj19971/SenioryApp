"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { SelectorHoras, type FechaSeleccion } from "@/components/contratacion/selector-horas";
import { ResumenCosto } from "@/components/contratacion/resumen-costo";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { useContratacion } from "@/components/contratacion/contratacion-provider";
import { confirmarContratacion } from "@/lib/services/contratacion";
import { calcularServicio } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { Cuidador, Jornada } from "@/lib/types";

function formatearISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

// Saldo de ejemplo para la demo — la bolsa de horas aún no tiene backend de saldo real.
const SALDO_BOLSA_DEMO_HORAS = 12;

export function FormularioContratacion({ cuidador }: { cuidador: Cuidador }) {
  const router = useRouter();
  const { setContratacionActual } = useContratacion();
  const [isPending, startTransition] = useTransition();

  const hoy = useMemo(() => new Date(), []);
  const manana = useMemo(() => {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() + 1);
    return fecha;
  }, [hoy]);

  const [fechaSeleccion, setFechaSeleccion] = useState<FechaSeleccion>("hoy");
  const [fechaPersonalizada, setFechaPersonalizada] = useState(formatearISO(manana));
  const [jornada, setJornada] = useState<Jornada>(cuidador.disponibilidad[0] ?? "manana");
  const [horas, setHoras] = useState(1);
  const [usarBolsa, setUsarBolsa] = useState(false);

  const resumen = useMemo(
    () => calcularServicio(cuidador.tarifaHora, horas),
    [cuidador.tarifaHora, horas],
  );

  const fechaISO =
    fechaSeleccion === "hoy"
      ? formatearISO(hoy)
      : fechaSeleccion === "manana"
        ? formatearISO(manana)
        : fechaPersonalizada;

  function confirmar() {
    startTransition(async () => {
      const contratacion = await confirmarContratacion({
        cuidadorId: cuidador.id,
        fecha: fechaISO,
        jornada,
        horas,
      });
      setContratacionActual(contratacion);
      router.push("/app/contratar/confirmacion");
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <SelectorHoras
        fechaSeleccion={fechaSeleccion}
        onFechaSeleccionChange={setFechaSeleccion}
        fechaPersonalizada={fechaPersonalizada}
        onFechaPersonalizadaChange={setFechaPersonalizada}
        fechaMinima={formatearISO(hoy)}
        jornada={jornada}
        onJornadaChange={setJornada}
        horas={horas}
        onHorasChange={setHoras}
      />

      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl p-4 ring-1",
          usarBolsa ? "bg-primary/10 ring-primary/30" : "bg-secondary/60 ring-transparent",
        )}
      >
        <div className="flex items-center gap-3">
          <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <Label htmlFor="usar-bolsa" className="text-base font-medium text-foreground">
              Usar bolsa de horas
            </Label>
            <p className="text-sm text-muted-foreground">
              Tienes {SALDO_BOLSA_DEMO_HORAS} horas prepago disponibles
            </p>
          </div>
        </div>
        <Switch id="usar-bolsa" checked={usarBolsa} onCheckedChange={setUsarBolsa} />
      </div>

      <ResumenCosto resumen={resumen} />

      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={confirmar}
          disabled={isPending}
          className={cn(buttonVariants({ className: "h-14 w-full rounded-full text-base" }))}
        >
          {isPending ? "Confirmando…" : "Confirmar contratación"}
        </button>
      </div>
    </div>
  );
}
