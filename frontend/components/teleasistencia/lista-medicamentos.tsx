"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Pill } from "lucide-react";
import { useAlarmaSonido } from "@/lib/hooks/use-alarma-sonido";
import { cn } from "@/lib/utils";
import type { Medicamento } from "@/lib/types";

function horaProgramadaHoy(hora: string, referencia: Date): Date {
  const [horas, minutos] = hora.split(":").map(Number);
  const fecha = new Date(referencia);
  fecha.setHours(horas, minutos, 0, 0);
  return fecha;
}

export function ListaMedicamentos({
  medicamentos: medicamentosIniciales,
}: {
  medicamentos: Medicamento[];
}) {
  const [medicamentos, setMedicamentos] = useState(medicamentosIniciales);
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    // Hora real del sistema (externa): se lee al montar para evitar
    // desajustes de hidratación entre el render del servidor y el cliente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAhora(new Date());
    const intervalo = setInterval(() => setAhora(new Date()), 15000);
    return () => clearInterval(intervalo);
  }, []);

  const ordenados = useMemo(
    () => [...medicamentos].sort((a, b) => a.hora.localeCompare(b.hora)),
    [medicamentos],
  );

  const proximoPendienteId = ordenados.find((medicamento) => !medicamento.tomado)?.id;
  const tomadosCount = ordenados.filter((medicamento) => medicamento.tomado).length;

  const medicamentoEnAlarma = useMemo(() => {
    if (!ahora) return null;
    return (
      ordenados.find(
        (medicamento) => !medicamento.tomado && horaProgramadaHoy(medicamento.hora, ahora) <= ahora,
      ) ?? null
    );
  }, [ordenados, ahora]);

  useAlarmaSonido(medicamentoEnAlarma !== null);

  function alternarTomado(id: string) {
    setMedicamentos((actuales) =>
      actuales.map((medicamento) =>
        medicamento.id === id
          ? { ...medicamento, tomado: !medicamento.tomado }
          : medicamento,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {medicamentoEnAlarma && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl bg-accent p-3 text-accent-foreground shadow-lg"
        >
          <span className="flex size-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-white/25">
            <BellRing className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">¡Hora del medicamento!</p>
            <p className="text-sm text-accent-foreground/90">
              {medicamentoEnAlarma.nombre} · {medicamentoEnAlarma.dosis}
            </p>
          </div>
          <button
            type="button"
            onClick={() => alternarTomado(medicamentoEnAlarma.id)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-accent"
          >
            <Check className="size-4" aria-hidden="true" />
            Ya se tomó
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {tomadosCount} de {ordenados.length} tomados hoy
        </p>
        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${ordenados.length ? (tomadosCount / ordenados.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      <ul className="flex flex-col gap-2">
      {ordenados.map((medicamento) => {
        const esProximoPendiente = medicamento.id === proximoPendienteId;
        const enAlarma = medicamento.id === medicamentoEnAlarma?.id;
        return (
          <li
            key={medicamento.id}
            className={cn(
              "flex items-center gap-3 rounded-xl p-3 ring-1",
              enAlarma
                ? "bg-accent/15 ring-2 ring-accent"
                : esProximoPendiente
                  ? "bg-accent/10 ring-accent"
                  : medicamento.tomado
                    ? "bg-muted/60 ring-border"
                    : "bg-card ring-border",
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                enAlarma
                  ? "bg-accent/20 text-accent"
                  : medicamento.tomado
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <Pill className="size-5" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p
                className={cn(
                  "text-base font-medium",
                  medicamento.tomado ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {medicamento.nombre} · {medicamento.dosis}
              </p>
              <p className="text-sm text-muted-foreground">
                {medicamento.hora} {enAlarma ? "· Atrasado" : esProximoPendiente && "· Próximo"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => alternarTomado(medicamento.id)}
              aria-pressed={medicamento.tomado}
              aria-label={
                medicamento.tomado
                  ? `Marcar ${medicamento.nombre} como no tomado`
                  : `Marcar ${medicamento.nombre} como tomado`
              }
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                medicamento.tomado
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-transparent hover:border-primary/50",
              )}
            >
              <Check className="size-6" aria-hidden="true" />
            </button>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
