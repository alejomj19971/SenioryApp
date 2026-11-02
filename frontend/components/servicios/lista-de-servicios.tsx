"use client";

import { useState } from "react";
import { TarjetaDeServicio } from "@/components/servicios/tarjeta-de-servicio";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { cargarMasServiciosAccion } from "@/lib/acciones/servicios";
import type { Servicio } from "@/lib/types";

// Los servicios de la familia, del más reciente al más antiguo; «Ver más» pide la página siguiente con el cursor.
export function ListaDeServicios({ servicios: primera, siguiente: primeraSiguiente }: { servicios: Servicio[]; siguiente: string | null }) {
  const [servicios, setServicios] = useState(primera);
  const [siguiente, setSiguiente] = useState(primeraSiguiente);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verMas() {
    if (siguiente === null || cargando) return;
    setCargando(true);
    setError(null);
    const resultado = await cargarMasServiciosAccion(siguiente);
    setCargando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
      return;
    }
    const ids = new Set(servicios.map((servicio) => servicio.id));
    setServicios([...servicios, ...resultado.pagina.servicios.filter((servicio) => !ids.has(servicio.id))]);
    setSiguiente(resultado.pagina.siguiente);
  }

  return (
    <div className="lista-con-entrada flex flex-col gap-3">
      {servicios.map((servicio) => (
        <TarjetaDeServicio key={servicio.id} servicio={servicio} />
      ))}
      {error !== null && (
        <Aviso titulo="No pudimos cargar más servicios" descripcion={error} accion={<Button variant="outline" size="sm" onClick={verMas}>Reintentar</Button>} />
      )}
      {siguiente !== null && error === null && (
        <Button type="button" variant="outline" size="lg" className="w-full" disabled={cargando} onClick={verMas}>
          {cargando ? "Cargando…" : "Ver más servicios"}
        </Button>
      )}
    </div>
  );
}
