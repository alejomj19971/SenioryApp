"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CircleCheck, LocateFixed } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { guardarUbicacionAccion } from "@/lib/acciones/postulacion";
import { useUbicacionDelNavegador, type Coordenada } from "@/lib/hooks/use-ubicacion";

// El mapa depende de `window` (Leaflet): solo puede vivir en el navegador, nunca en el primer render del servidor.
const MapaDeUbicacion = dynamic(() => import("@/components/postulacion/mapa-de-ubicacion").then((modulo) => modulo.MapaDeUbicacion), {
  ssr: false,
  loading: () => <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">Cargando el mapa…</div>,
});

function mismoPunto(a: Coordenada | null, b: Coordenada | null): boolean {
  if (a === null || b === null) return a === b;
  return a.latitud === b.latitud && a.longitud === b.longitud;
}

// El pin que el cuidador deja en el mapa (M2): desde dónde sale a trabajar. Lo fija una sola vez y lo puede mover
// cuando quiera; a diferencia de la búsqueda de la familia, este punto SÍ se guarda (así puede ordenar por
// cercanía a quien busque).
export function UbicacionDeCuidador({ ubicacionGuardada }: { ubicacionGuardada: Coordenada | null }) {
  const [pin, setPin] = useState<Coordenada | null>(ubicacionGuardada);
  const [centrarEn, setCentrarEn] = useState<Coordenada | null>(null);
  const [errorDeUbicacion, setErrorDeUbicacion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const { obteniendo, obtenerUbicacion } = useUbicacionDelNavegador();

  const hayCambios = pin !== null && !mismoPunto(pin, ubicacionGuardada);

  async function usarMiUbicacion() {
    setErrorDeUbicacion(null);
    const resultadoDeUbicacion = await obtenerUbicacion();
    if (!resultadoDeUbicacion.ok) {
      setErrorDeUbicacion(resultadoDeUbicacion.mensaje);
      return;
    }
    setPin(resultadoDeUbicacion.datos);
    setCentrarEn(resultadoDeUbicacion.datos);
  }

  async function guardar() {
    if (pin === null) return;
    setGuardando(true);
    setResultado(null);
    const estado = await guardarUbicacionAccion(pin.latitud, pin.longitud);
    setGuardando(false);
    setResultado(estado.mensaje !== undefined ? { ok: false, mensaje: estado.mensaje } : { ok: true, mensaje: "Ubicación guardada." });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-muted-foreground">
        Toca el mapa o arrastra el pin hasta el punto desde donde sales a trabajar: así las familias que buscan cerca te encuentran primero. Nunca lo compartimos; solo sirve para ordenar la búsqueda.
      </p>
      <MapaDeUbicacion pin={pin} centrarEn={centrarEn} onCambiar={setPin} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={obteniendo} onClick={() => void usarMiUbicacion()}>
          <LocateFixed aria-hidden="true" />
          {obteniendo ? "Buscando tu ubicación…" : "Usar mi ubicación actual"}
        </Button>
        <Button type="button" disabled={!hayCambios || guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : "Guardar ubicación"}
        </Button>
      </div>
      {errorDeUbicacion !== null && <Aviso titulo="No pudimos usar tu ubicación" descripcion={errorDeUbicacion} />}
      {resultado !== null &&
        (resultado.ok ? (
          <p role="status" className="flex items-center gap-2 text-base font-medium text-success">
            <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            {resultado.mensaje}
          </p>
        ) : (
          <Aviso titulo="No pudimos guardar tu ubicación" descripcion={resultado.mensaje} />
        ))}
    </div>
  );
}
