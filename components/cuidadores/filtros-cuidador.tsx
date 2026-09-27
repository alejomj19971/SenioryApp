"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/chip";
import { etiquetaEspecialidad, etiquetaJornada, formatearCOP } from "@/lib/format";
import type { Especialidad, Jornada } from "@/lib/types";

const especialidades: Especialidad[] = [
  "auxiliar",
  "enfermeria",
  "fisioterapia",
  "acompanamiento",
];

const jornadas: Jornada[] = ["manana", "tarde", "noche"];

interface FiltrosCuidadorProps {
  busqueda: string;
  onBusquedaChange: (valor: string) => void;
  especialidad: Especialidad | null;
  onEspecialidadChange: (valor: Especialidad | null) => void;
  jornada: Jornada | null;
  onJornadaChange: (valor: Jornada | null) => void;
  zona: string | null;
  onZonaChange: (valor: string | null) => void;
  zonasDisponibles: string[];
  tarifaMaxima: number;
  onTarifaMaximaChange: (valor: number) => void;
  tarifaLimite: number;
}

export function FiltrosCuidador({
  busqueda,
  onBusquedaChange,
  especialidad,
  onEspecialidadChange,
  jornada,
  onJornadaChange,
  zona,
  onZonaChange,
  zonasDisponibles,
  tarifaMaxima,
  onTarifaMaximaChange,
  tarifaLimite,
}: FiltrosCuidadorProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={busqueda}
          onChange={(evento) => onBusquedaChange(evento.target.value)}
          placeholder="Buscar por nombre o especialidad"
          aria-label="Buscar por nombre o especialidad"
          className="h-12 rounded-full pl-10 text-base"
        />
      </div>

      <div
        role="group"
        aria-label="Filtrar por especialidad"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        <Chip activo={especialidad === null} onClick={() => onEspecialidadChange(null)}>
          Todas
        </Chip>
        {especialidades.map((valor) => (
          <Chip
            key={valor}
            activo={especialidad === valor}
            onClick={() =>
              onEspecialidadChange(especialidad === valor ? null : valor)
            }
          >
            {etiquetaEspecialidad(valor)}
          </Chip>
        ))}
      </div>

      <div
        role="group"
        aria-label="Filtrar por disponibilidad"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        <Chip activo={jornada === null} onClick={() => onJornadaChange(null)}>
          Cualquier horario
        </Chip>
        {jornadas.map((valor) => (
          <Chip
            key={valor}
            activo={jornada === valor}
            onClick={() => onJornadaChange(jornada === valor ? null : valor)}
          >
            {etiquetaJornada(valor)}
          </Chip>
        ))}
      </div>

      <div
        role="group"
        aria-label="Filtrar por zona"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        <Chip activo={zona === null} onClick={() => onZonaChange(null)}>
          Toda la ciudad
        </Chip>
        {zonasDisponibles.map((valor) => (
          <Chip
            key={valor}
            activo={zona === valor}
            onClick={() => onZonaChange(zona === valor ? null : valor)}
          >
            {valor}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tarifa-maxima" className="text-sm font-medium text-foreground">
          Tarifa hasta {formatearCOP(tarifaMaxima)}/hora
        </label>
        <input
          id="tarifa-maxima"
          type="range"
          min={0}
          max={tarifaLimite}
          step={1000}
          value={tarifaMaxima}
          onChange={(evento) => onTarifaMaximaChange(Number(evento.target.value))}
          className="h-3 w-full accent-primary"
        />
      </div>
    </div>
  );
}
