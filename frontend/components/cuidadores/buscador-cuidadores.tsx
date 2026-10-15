"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { FiltrosCuidador } from "@/components/cuidadores/filtros-cuidador";
import { TarjetaCuidador } from "@/components/cuidadores/tarjeta-cuidador";
import type { Cuidador, Especialidad, Jornada } from "@/lib/types";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function BuscadorCuidadores({ cuidadores }: { cuidadores: Cuidador[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [especialidad, setEspecialidad] = useState<Especialidad | null>(null);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [zona, setZona] = useState<string | null>(null);

  const tarifaLimite = useMemo(
    () => Math.max(...cuidadores.map((cuidador) => cuidador.tarifaHora)),
    [cuidadores],
  );
  const [tarifaMaxima, setTarifaMaxima] = useState(tarifaLimite);

  const zonasDisponibles = useMemo(
    () => Array.from(new Set(cuidadores.map((cuidador) => cuidador.zona))).sort(),
    [cuidadores],
  );

  const resultados = useMemo(() => {
    const terminoBusqueda = normalizar(busqueda);
    return cuidadores.filter((cuidador) => {
      if (terminoBusqueda) {
        const coincide =
          normalizar(cuidador.nombre).includes(terminoBusqueda) ||
          normalizar(cuidador.especialidad).includes(terminoBusqueda);
        if (!coincide) return false;
      }
      if (especialidad && cuidador.especialidad !== especialidad) return false;
      if (jornada && !cuidador.disponibilidad.includes(jornada)) return false;
      if (zona && cuidador.zona !== zona) return false;
      if (cuidador.tarifaHora > tarifaMaxima) return false;
      return true;
    });
  }, [cuidadores, busqueda, especialidad, jornada, zona, tarifaMaxima]);

  function limpiarFiltros() {
    setBusqueda("");
    setEspecialidad(null);
    setJornada(null);
    setZona(null);
    setTarifaMaxima(tarifaLimite);
  }

  return (
    <div className="flex flex-col gap-5">
      <FiltrosCuidador
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        especialidad={especialidad}
        onEspecialidadChange={setEspecialidad}
        jornada={jornada}
        onJornadaChange={setJornada}
        zona={zona}
        onZonaChange={setZona}
        zonasDisponibles={zonasDisponibles}
        tarifaMaxima={tarifaMaxima}
        onTarifaMaximaChange={setTarifaMaxima}
        tarifaLimite={tarifaLimite}
      />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {resultados.length}{" "}
        {resultados.length === 1 ? "cuidador encontrado" : "cuidadores encontrados"}
      </p>

      {resultados.length > 0 ? (
        <div className="flex flex-col gap-3">
          {resultados.map((cuidador) => (
            <TarjetaCuidador key={cuidador.id} cuidador={cuidador} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">
            No encontramos cuidadores con esos filtros
          </p>
          <p className="text-sm text-muted-foreground">
            Prueba ajustando la especialidad, la zona o la tarifa.
          </p>
          <button
            type="button"
            onClick={limpiarFiltros}
            className="mt-1 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Quitar filtros
          </button>
        </div>
      )}
    </div>
  );
}
