"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check, Pill } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { marcarTomaAccion } from "@/lib/acciones/teleasistencia";
import { ahoraEnColombia } from "@/lib/fecha-colombia";
import { useAlarmaSonido } from "@/lib/hooks/use-alarma-sonido";
import { cn } from "@/lib/utils";
import type { EstadoDeToma, TomaDelDia } from "@/lib/types";

const minutosDe = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

// Las tomas de hoy (F6). El estado de cada una es el del backend; al marcar, la pantalla responde de inmediato
// (optimista) y, si el servidor no lo acepta (otra pantalla ya la cambió, el día no corresponde), vuelve a como estaba
// y lo dice. «Hora» siempre es la de Colombia.
export function ListaMedicamentos({ tomas }: { tomas: TomaDelDia[] }) {
  const enrutador = useRouter();
  const [enCurso, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistas, aplicar] = useOptimistic(tomas, (actuales, cambio: { tomaId: string; estado: EstadoDeToma }) =>
    actuales.map((toma) => (toma.tomaId === cambio.tomaId ? { ...toma, estado: cambio.estado } : toma)),
  );

  // La hora de Colombia se lee al montar (no durante el render del servidor) para no desajustar la hidratación.
  const [minutosAhora, setMinutosAhora] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinutosAhora(ahoraEnColombia().minutos);
    const intervalo = setInterval(() => setMinutosAhora(ahoraEnColombia().minutos), 15_000);
    return () => clearInterval(intervalo);
  }, []);

  const pendientes = optimistas.filter((toma) => toma.estado === "pendiente");
  const proximaId = pendientes[0]?.tomaId;
  const tomadas = optimistas.filter((toma) => toma.estado === "tomada").length;
  // Una toma pendiente cuya hora ya llegó: suena la alarma y se avisa.
  const enAlarma = useMemo(
    () => (minutosAhora === null ? null : (pendientes.find((toma) => minutosDe(toma.hora) <= minutosAhora) ?? null)),
    [pendientes, minutosAhora],
  );
  useAlarmaSonido(enAlarma !== null);

  function alternar(toma: TomaDelDia) {
    const nuevo: "tomada" | "pendiente" = toma.estado === "tomada" ? "pendiente" : "tomada";
    empezar(async () => {
      aplicar({ tomaId: toma.tomaId, estado: nuevo });
      const resultado = await marcarTomaAccion(toma.medicamentoId, toma.tomaId, nuevo);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        enrutador.refresh();
        return;
      }
      setError(null);
    });
  }

  if (optimistas.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-muted p-4">
        <p className="text-base text-foreground">Todavía no hay medicamentos para hoy.</p>
        <Link href="/app/teleasistencia/medicamentos" className="inline-flex min-h-12 items-center font-medium text-primary underline underline-offset-4">
          Agregar un medicamento
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {enAlarma !== null && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-warning p-3 text-warning-foreground shadow-lg">
          <span className="flex size-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-warning-foreground/15">
            <BellRing className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold">¡Hora del medicamento!</p>
            <p className="text-base">
              {enAlarma.nombre} · {enAlarma.dosis}
            </p>
          </div>
          <button
            type="button"
            onClick={() => alternar(enAlarma)}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-card px-4 text-base font-semibold text-foreground"
          >
            <Check className="size-4" aria-hidden="true" />
            Ya se tomó
          </button>
        </div>
      )}

      {error !== null && <Aviso titulo="No pudimos guardar el cambio" descripcion={error} />}

      <div className="flex items-center justify-between">
        <p className="text-base font-medium text-muted-foreground">
          {tomadas} de {optimistas.length} tomadas hoy
        </p>
        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(tomadas / optimistas.length) * 100}%` }} />
        </div>
      </div>

      <ul className="flex flex-col gap-2" aria-busy={enCurso}>
        {optimistas.map((toma) => {
          const esProxima = toma.tomaId === proximaId;
          const atrasada = toma.tomaId === enAlarma?.tomaId;
          const hecha = toma.estado === "tomada";
          return (
            <li
              key={toma.tomaId}
              className={cn(
                "flex items-center gap-3 rounded-xl p-3 ring-1",
                atrasada ? "bg-warning/15 ring-2 ring-warning" : esProxima ? "bg-info/10 ring-info" : hecha ? "bg-muted/60 ring-border" : "bg-card ring-border",
              )}
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", hecha ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                <Pill className="size-5" aria-hidden="true" />
              </span>
              <div className="flex-1">
                <p className={cn("text-base font-medium", hecha ? "text-muted-foreground line-through" : "text-foreground")}>
                  {toma.nombre} · {toma.dosis}
                </p>
                <p className="text-sm text-muted-foreground">
                  {toma.hora}
                  {toma.estado === "omitida" && " · Omitida"}
                  {toma.estado === "pendiente" && atrasada && " · Atrasada"}
                  {toma.estado === "pendiente" && !atrasada && esProxima && " · Próxima"}
                  {toma.indicaciones !== "" && ` · ${toma.indicaciones}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => alternar(toma)}
                aria-pressed={hecha}
                aria-label={hecha ? `Deshacer: ${toma.nombre} de las ${toma.hora} no se tomó` : `Marcar ${toma.nombre} de las ${toma.hora} como tomado`}
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  hecha ? "border-success bg-success text-success-foreground" : "border-input bg-background text-transparent hover:border-primary/50",
                )}
              >
                <Check className="size-6" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <Link href="/app/teleasistencia/medicamentos" className="inline-flex min-h-12 w-fit items-center font-medium text-primary underline underline-offset-4">
        Administrar medicamentos
      </Link>
    </div>
  );
}
