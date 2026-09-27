"use client";

import { useMemo, useState } from "react";
import { Check, Pill } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Medicamento } from "@/lib/types";

export function ListaMedicamentos({
  medicamentos: medicamentosIniciales,
}: {
  medicamentos: Medicamento[];
}) {
  const [medicamentos, setMedicamentos] = useState(medicamentosIniciales);

  const ordenados = useMemo(
    () => [...medicamentos].sort((a, b) => a.hora.localeCompare(b.hora)),
    [medicamentos],
  );

  const proximoPendienteId = ordenados.find((medicamento) => !medicamento.tomado)?.id;

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
    <ul className="flex flex-col gap-2">
      {ordenados.map((medicamento) => {
        const esProximoPendiente = medicamento.id === proximoPendienteId;
        return (
          <li
            key={medicamento.id}
            className={cn(
              "flex items-center gap-3 rounded-xl p-3 ring-1",
              esProximoPendiente
                ? "bg-accent/10 ring-accent"
                : medicamento.tomado
                  ? "bg-muted/60 ring-border"
                  : "bg-card ring-border",
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                medicamento.tomado ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
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
                {medicamento.hora} {esProximoPendiente && "· Próximo"}
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
  );
}
