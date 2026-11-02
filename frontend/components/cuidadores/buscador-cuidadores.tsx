"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, SearchX } from "lucide-react";
import { FiltrosCuidador } from "@/components/cuidadores/filtros-cuidador";
import { TarjetaCuidador } from "@/components/cuidadores/tarjeta-cuidador";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { cargarMasCuidadores } from "@/lib/acciones/cuidadores";
import { consultaDeFiltros } from "@/lib/filtros-de-cuidadores";
import type { CuidadorResumen, Especialidad, FiltrosCuidador as Filtros, Jornada } from "@/lib/types";

// Cuánto se espera después de la última tecla o ajuste antes de buscar en el servidor.
const ESPERA_DE_BUSQUEDA_MS = 350;

interface BuscadorProps {
  // La primera página, ya buscada en el servidor con los filtros de la URL.
  cuidadores: CuidadorResumen[];
  siguiente: string | null;
  // Los filtros que se aplicaron (los de la URL).
  filtros: Filtros;
  zonas: string[];
  tarifaLimite: number;
}

// La búsqueda de cuidadores (F2). Los filtros viven en la URL: al cambiarlos, el servidor vuelve a buscar y esta
// pantalla recibe la primera página nueva. «Ver más» pide la siguiente con el cursor del backend.
export function BuscadorCuidadores({
  cuidadores: primera,
  siguiente: primeraSiguiente,
  filtros,
  zonas,
  tarifaLimite,
}: BuscadorProps) {
  const enrutador = useRouter();
  const ruta = usePathname();
  const [buscando, empezarBusqueda] = useTransition();

  const [busqueda, setBusqueda] = useState(filtros.busqueda ?? "");
  const [especialidad, setEspecialidad] = useState<Especialidad | null>(filtros.especialidad ?? null);
  const [jornada, setJornada] = useState<Jornada | null>(filtros.jornada ?? null);
  const [zona, setZona] = useState<string | null>(filtros.zona ?? null);
  // El tope del control deslizante significa «sin límite de tarifa»: no se envía.
  const [tarifaMaxima, setTarifaMaxima] = useState(Math.min(filtros.tarifaMaxima ?? tarifaLimite, tarifaLimite));

  // Lo que se muestra: la primera página (la que trajo el servidor para estos filtros) y las que se hayan pedido
  // con «Ver más» PARA ESTOS MISMOS filtros. Se guarda con la búsqueda a la que pertenecen, así una búsqueda nueva
  // descarta sola las páginas de la anterior sin remontar la pantalla (el panel de filtros y el foco se conservan).
  const clave = consultaDeFiltros(filtros);
  const [adicionales, setAdicionales] = useState<{ clave: string; cuidadores: CuidadorResumen[]; siguiente: string | null } | null>(null);
  const vigentes = adicionales !== null && adicionales.clave === clave ? adicionales : null;
  const cuidadores = vigentes === null ? primera : [...primera, ...vigentes.cuidadores];
  const siguiente = vigentes === null ? primeraSiguiente : vigentes.siguiente;
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorAlCargar, setErrorAlCargar] = useState<string | null>(null);

  // Al cambiar un filtro, se actualiza la URL (con espera) y el servidor busca de nuevo.
  const consultaActual = clave;
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    const deseados: Filtros = {
      ...(busqueda.trim() !== "" ? { busqueda: busqueda.trim() } : {}),
      ...(especialidad !== null ? { especialidad } : {}),
      ...(jornada !== null ? { jornada } : {}),
      ...(zona !== null ? { zona } : {}),
      ...(tarifaMaxima < tarifaLimite ? { tarifaMaxima } : {}),
    };
    const consulta = consultaDeFiltros(deseados);
    if (consulta === consultaActual) return;
    const espera = setTimeout(() => {
      empezarBusqueda(() => enrutador.replace(consulta === "" ? ruta : `${ruta}?${consulta}`, { scroll: false }));
    }, ESPERA_DE_BUSQUEDA_MS);
    return () => clearTimeout(espera);
  }, [busqueda, especialidad, jornada, zona, tarifaMaxima, tarifaLimite, consultaActual, enrutador, ruta]);

  function limpiarFiltros() {
    setBusqueda("");
    setEspecialidad(null);
    setJornada(null);
    setZona(null);
    setTarifaMaxima(tarifaLimite);
  }

  async function verMas() {
    if (siguiente === null || cargandoMas) return;
    setCargandoMas(true);
    setErrorAlCargar(null);
    const resultado = await cargarMasCuidadores(filtros, siguiente);
    setCargandoMas(false);
    if (!resultado.ok) {
      setErrorAlCargar(resultado.mensaje);
      return;
    }
    // Si alguien entró mientras se paginaba, el cursor evita repetidos; aun así se descartan por id.
    const ids = new Set(cuidadores.map((cuidador) => cuidador.id));
    setAdicionales({
      clave,
      cuidadores: [...(vigentes?.cuidadores ?? []), ...resultado.pagina.cuidadores.filter((cuidador) => !ids.has(cuidador.id))],
      siguiente: resultado.pagina.siguiente,
    });
  }

  const hayFiltros = consultaActual !== "";

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
        zonasDisponibles={zonas}
        tarifaMaxima={tarifaMaxima}
        onTarifaMaximaChange={setTarifaMaxima}
        tarifaLimite={tarifaLimite}
      />

      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {buscando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {buscando
          ? "Buscando…"
          : `${cuidadores.length}${siguiente !== null ? " o más" : ""} ${cuidadores.length === 1 ? "cuidador encontrado" : "cuidadores encontrados"}`}
      </p>

      {cuidadores.length > 0 ? (
        <div className="lista-con-entrada flex flex-col gap-3" aria-busy={buscando}>
          {cuidadores.map((cuidador) => (
            <TarjetaCuidador key={cuidador.id} cuidador={cuidador} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">
            {hayFiltros ? "No encontramos cuidadores con esos filtros" : "Todavía no hay cuidadores disponibles"}
          </p>
          <p className="text-sm text-muted-foreground">
            {hayFiltros
              ? "Prueba ajustando la especialidad, la zona o la tarifa."
              : "Estamos verificando a los primeros cuidadores. Vuelve pronto."}
          </p>
          {hayFiltros && (
            <Button type="button" onClick={limpiarFiltros}>
              Quitar filtros
            </Button>
          )}
        </div>
      )}

      {errorAlCargar !== null && (
        <Aviso
          titulo="No pudimos cargar más cuidadores"
          descripcion={errorAlCargar}
          accion={
            <Button type="button" variant="outline" size="sm" onClick={verMas}>
              Reintentar
            </Button>
          }
        />
      )}

      {siguiente !== null && errorAlCargar === null && (
        <Button type="button" variant="outline" size="lg" className="w-full" disabled={cargandoMas} onClick={verMas}>
          {cargandoMas ? "Cargando…" : "Ver más cuidadores"}
        </Button>
      )}
    </div>
  );
}
