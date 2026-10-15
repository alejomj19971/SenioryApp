"use client";

import { Minus, Plus } from "lucide-react";
import { Chip } from "@/components/chip";
import type { Jornada } from "@/lib/types";
import { etiquetaJornada } from "@/lib/format";

export type FechaSeleccion = "hoy" | "manana" | "elegir";

const jornadas: Jornada[] = ["manana", "tarde", "noche"];

interface SelectorHorasProps {
  fechaSeleccion: FechaSeleccion;
  onFechaSeleccionChange: (valor: FechaSeleccion) => void;
  fechaPersonalizada: string;
  onFechaPersonalizadaChange: (valor: string) => void;
  fechaMinima: string;
  jornada: Jornada;
  onJornadaChange: (valor: Jornada) => void;
  horas: number;
  onHorasChange: (valor: number) => void;
}

const HORAS_MINIMAS = 1;
const HORAS_MAXIMAS = 8;

export function SelectorHoras({
  fechaSeleccion,
  onFechaSeleccionChange,
  fechaPersonalizada,
  onFechaPersonalizadaChange,
  fechaMinima,
  jornada,
  onJornadaChange,
  horas,
  onHorasChange,
}: SelectorHorasProps) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold text-foreground">Fecha</span>
        <div role="group" aria-label="Elegir fecha" className="flex flex-wrap gap-2">
          <Chip activo={fechaSeleccion === "hoy"} onClick={() => onFechaSeleccionChange("hoy")}>
            Hoy
          </Chip>
          <Chip activo={fechaSeleccion === "manana"} onClick={() => onFechaSeleccionChange("manana")}>
            Mañana
          </Chip>
          <Chip activo={fechaSeleccion === "elegir"} onClick={() => onFechaSeleccionChange("elegir")}>
            Elegir fecha
          </Chip>
        </div>
        {fechaSeleccion === "elegir" && (
          <input
            type="date"
            value={fechaPersonalizada}
            min={fechaMinima}
            onChange={(evento) => onFechaPersonalizadaChange(evento.target.value)}
            aria-label="Fecha personalizada"
            className="h-12 w-fit rounded-xl border border-border bg-background px-3 text-base text-foreground"
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold text-foreground">Franja horaria</span>
        <div role="group" aria-label="Elegir franja horaria" className="flex flex-wrap gap-2">
          {jornadas.map((valor) => (
            <Chip key={valor} activo={jornada === valor} onClick={() => onJornadaChange(valor)}>
              {etiquetaJornada(valor)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold text-foreground">Número de horas</span>
        <div className="flex items-center justify-between rounded-2xl bg-muted p-3">
          <button
            type="button"
            onClick={() => onHorasChange(Math.max(HORAS_MINIMAS, horas - 1))}
            disabled={horas <= HORAS_MINIMAS}
            aria-label="Reducir número de horas"
            className="flex size-12 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border disabled:opacity-40"
          >
            <Minus className="size-5" aria-hidden="true" />
          </button>
          <span className="text-2xl font-bold text-foreground" aria-live="polite">
            {horas} {horas === 1 ? "hora" : "horas"}
          </span>
          <button
            type="button"
            onClick={() => onHorasChange(Math.min(HORAS_MAXIMAS, horas + 1))}
            disabled={horas >= HORAS_MAXIMAS}
            aria-label="Aumentar número de horas"
            className="flex size-12 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border disabled:opacity-40"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
