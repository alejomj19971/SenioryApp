"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { Aviso as AvisoDeError } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cargarAvisosAccion } from "@/lib/acciones/avisos";
import { avisosNuevos, destinoDelAviso } from "@/lib/avisos";
import { formatearFechaHora } from "@/lib/format";
import type { Aviso } from "@/lib/types";

interface ListaDeAvisosProps {
  inicial: Aviso[];
  // Para pedir los siguientes; null si no hay más.
  siguiente: string | null;
  // Hasta qué aviso ya los había visto en este dispositivo (para marcar los nuevos al abrir).
  vistoHasta: string | undefined;
  base: "/app" | "/cuidador";
}

// Los avisos de la persona, los más recientes primero. Los que no había visto en este dispositivo llevan «Nuevo»; los
// importantes (alertas) se distinguen, y cada uno lleva a su pantalla cuando la hay.
export function ListaDeAvisos({ inicial, siguiente: primerSiguiente, vistoHasta, base }: ListaDeAvisosProps) {
  const [avisos, setAvisos] = useState(inicial);
  const [siguiente, setSiguiente] = useState(primerSiguiente);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Se decide al abrir y no cambia mientras se mira (la cookie se actualiza, esta lista no se «apaga» sola).
  const [nuevos] = useState(() => new Set(avisosNuevos(inicial, vistoHasta).map((aviso) => aviso.id)));

  async function verMas() {
    if (siguiente === null || cargando) return;
    setCargando(true);
    const resultado = await cargarAvisosAccion(siguiente);
    setCargando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
      return;
    }
    setError(null);
    setAvisos((actuales) => {
      const conocidos = new Set(actuales.map((aviso) => aviso.id));
      return [...actuales, ...resultado.pagina.avisos.filter((aviso) => !conocidos.has(aviso.id))];
    });
    setSiguiente(resultado.pagina.siguiente);
  }

  if (avisos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
        <Bell className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-base font-medium text-foreground">No tienes avisos</p>
        <p className="text-base text-muted-foreground">Aquí aparece lo que pasa con tus servicios, pagos y mensajes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {avisos.map((aviso) => {
          const destino = destinoDelAviso(aviso.tipo, base);
          const contenido = (
            <>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-foreground">{aviso.titulo}</p>
                  {aviso.prioridad === "alta" && <Badge variant="destructive">Importante</Badge>}
                  {nuevos.has(aviso.id) && <Badge variant="info">Nuevo</Badge>}
                </div>
                <p className="text-base text-foreground">{aviso.cuerpo}</p>
                <p className="text-sm text-muted-foreground">{formatearFechaHora(aviso.creadaEn)}</p>
              </div>
              {destino !== null && <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
            </>
          );
          const clases = "flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border";
          return (
            <li key={aviso.id}>
              {destino === null ? (
                <div className={clases}>{contenido}</div>
              ) : (
                <Link href={destino} className={`${clases} transition-colors hover:ring-primary/40`}>
                  {contenido}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {error !== null && <AvisoDeError titulo="No pudimos cargar más avisos" descripcion={error} />}
      {siguiente !== null && (
        <Button type="button" variant="outline" className="w-fit self-center" onClick={verMas} disabled={cargando}>
          {cargando ? "Cargando…" : "Ver avisos anteriores"}
        </Button>
      )}
    </div>
  );
}
