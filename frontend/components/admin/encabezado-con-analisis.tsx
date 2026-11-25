import Link from "next/link";
import { ChartColumn, ChevronUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

interface EncabezadoConAnalisisProps {
  titulo: string;
  subtitulo: string;
  abierto: boolean;
  // A dónde lleva el botón: la misma página con el análisis abierto o cerrado, conservando la búsqueda y el filtro.
  direccionAlternada: string;
}

// El título de la página con el botón del análisis. Recogido por omisión: lo primero que se ve es la lista de cuidadores y el
// análisis está a un toque. Abrirlo cambia la dirección (`?analisis=1`) en vez de un estado del navegador, así el servidor solo
// calcula el análisis cuando se pide (y no con cada búsqueda). En el celular el botón baja bajo el título si no cabe al lado.
export function EncabezadoConAnalisis({ titulo, subtitulo, abierto, direccionAlternada }: EncabezadoConAnalisisProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground">{titulo}</h1>
        <p className="text-base text-muted-foreground">{subtitulo}</p>
      </div>
      <Link href={direccionAlternada} scroll={false} className={buttonVariants({ variant: abierto ? "default" : "outline" })}>
        {abierto ? <ChevronUp aria-hidden="true" /> : <ChartColumn aria-hidden="true" />}
        {abierto ? "Ocultar análisis" : "Ver análisis"}
      </Link>
    </div>
  );
}
