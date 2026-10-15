"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal, Search, Mic, MicOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/chip";
import { cn } from "@/lib/utils";
import { etiquetaEspecialidad, etiquetaJornada, formatearCOP } from "@/lib/format";
import { useReconocimientoVoz } from "@/lib/hooks/use-reconocimiento-voz";
import type { Especialidad, Jornada } from "@/lib/types";

const especialidades: Especialidad[] = [
  "auxiliar",
  "enfermeria",
  "fisioterapia",
  "acompanamiento",
];

const jornadas: Jornada[] = ["manana", "tarde", "noche"];

const sinonimosEspecialidad: Record<Especialidad, string[]> = {
  auxiliar: ["auxiliar", "auxiliares"],
  enfermeria: ["enfermeria", "enfermera", "enfermero", "enfermeras", "enfermeros"],
  fisioterapia: ["fisioterapia", "fisioterapeuta", "fisioterapeutas"],
  acompanamiento: ["acompanamiento", "acompanante", "acompanantes"],
};

const PALABRAS_VACIAS = new Set([
  "busca", "buscar", "busco", "buscame", "encuentra", "encuentrame",
  "quiero", "necesito", "muestrame", "muestra", "dame",
  "un", "una", "unos", "unas", "el", "la", "los", "las",
  "cuidador", "cuidadora", "cuidadores", "cuidadoras",
  "de", "en", "para", "con", "que", "sea", "por", "favor", "porfa", "porfavor",
]);

function normalizarPalabra(palabra: string): string {
  return palabra
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function extraerEspecialidad(transcripcionNormalizada: string): Especialidad | null {
  for (const especialidad of especialidades) {
    if (sinonimosEspecialidad[especialidad].some((s) => transcripcionNormalizada.includes(s))) {
      return especialidad;
    }
  }
  return null;
}

function extraerZona(transcripcionNormalizada: string, zonas: string[]): string | null {
  for (const zona of zonas) {
    const zonaCorta = normalizarTexto(zona.split(",")[0]).trim();
    if (zonaCorta && transcripcionNormalizada.includes(zonaCorta)) {
      return zona;
    }
  }
  return null;
}

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
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  const { soportado: vozSoportada, escuchando, mensaje, alternarEscucha } = useReconocimientoVoz(
    (transcripcionOriginal) => {
      const transcripcionNormalizada = normalizarTexto(transcripcionOriginal);
      const especialidadDetectada = extraerEspecialidad(transcripcionNormalizada);
      const zonaDetectada = extraerZona(transcripcionNormalizada, zonasDisponibles);

      const palabrasAIgnorar = new Set<string>([
        ...(especialidadDetectada ? sinonimosEspecialidad[especialidadDetectada] : []),
        ...(zonaDetectada ? zonaDetectada.split(",")[0].split(/\s+/).map(normalizarPalabra) : []),
      ]);

      const palabrasRestantes = transcripcionOriginal
        .split(/\s+/)
        .filter((palabra) => {
          const normalizada = normalizarPalabra(palabra);
          if (!normalizada) return false;
          if (PALABRAS_VACIAS.has(normalizada)) return false;
          if (palabrasAIgnorar.has(normalizada)) return false;
          return true;
        });

      onEspecialidadChange(especialidadDetectada);
      onZonaChange(zonaDetectada);
      onBusquedaChange(palabrasRestantes.join(" "));

      if (especialidadDetectada || zonaDetectada) {
        setFiltrosAbiertos(true);
      }

      const partesEntendidas = [
        especialidadDetectada && etiquetaEspecialidad(especialidadDetectada),
        zonaDetectada,
        palabrasRestantes.length > 0 && `"${palabrasRestantes.join(" ")}"`,
      ].filter(Boolean);

      return partesEntendidas.length > 0
        ? `Buscando: ${partesEntendidas.join(" · ")}`
        : "No escuché nada. Intenta de nuevo.";
    },
  );

  const filtrosActivos = [
    especialidad !== null,
    jornada !== null,
    zona !== null,
    tarifaMaxima < tarifaLimite,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busqueda}
            onChange={(evento) => onBusquedaChange(evento.target.value)}
            placeholder="Buscar por nombre o especialidad"
            aria-label="Buscar por nombre o especialidad"
            className={cn("h-12 rounded-full pl-10 text-base", vozSoportada && "pr-12")}
          />
          {vozSoportada && (
            <button
              type="button"
              onClick={alternarEscucha}
              aria-pressed={escuchando}
              aria-label={
                escuchando
                  ? "Detener búsqueda por voz"
                  : "Buscar por voz: di el nombre, la especialidad o la zona que buscas"
              }
              className={cn(
                "absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
                escuchando
                  ? "animate-pulse bg-destructive text-white"
                  : "text-primary hover:bg-primary/10",
              )}
            >
              {escuchando ? (
                <MicOff className="size-4" aria-hidden="true" />
              ) : (
                <Mic className="size-4" aria-hidden="true" />
              )}
            </button>
          )}
          {mensaje && (
            <div
              role="status"
              className="absolute top-full left-0 z-40 mt-2 w-full rounded-xl bg-foreground px-3 py-2 text-left text-xs font-medium text-background shadow-lg"
            >
              {mensaje}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltrosAbiertos((valor) => !valor)}
          aria-expanded={filtrosAbiertos}
          aria-label="Mostrar u ocultar filtros"
          className={cn(
            "flex h-12 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
            filtrosActivos > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-foreground hover:border-primary/50",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtros
          {filtrosActivos > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {filtrosActivos}
            </span>
          )}
          <ChevronDown
            className={cn("size-4 transition-transform", filtrosAbiertos && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {filtrosAbiertos && (
        <div className="flex flex-col gap-4 rounded-2xl bg-muted/60 p-4">
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
      )}
    </div>
  );
}
