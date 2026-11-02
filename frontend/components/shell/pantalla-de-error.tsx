"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PantallaDeErrorProps {
  // A dónde manda «Ir al inicio» (cada área tiene la suya: /app, /cuidador, /admin, /).
  rutaDeInicio: string;
  etiquetaDeInicio: string;
  retry: () => void;
  // Un error del servidor ya trae un mensaje genérico (Next lo reemplaza para no filtrar detalles); uno del
  // navegador podría traer detalles internos. Por eso NUNCA se muestra `error.message`: solo el texto fijo de
  // abajo y, si existe, el `digest` para dar soporte (F0 §4.8, E1).
  digest: string | undefined;
}

// Lo que se ve cuando algo falla al cargar una pantalla (F0 §4.8, E1: «si algo falla, el usuario recibe un mensaje
// claro»), compartido por cada área con error boundary propio (F10 §7: ninguna área se queda sin uno).
export function PantallaDeError({ rutaDeInicio, etiquetaDeInicio, retry, digest }: PantallaDeErrorProps) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      </span>
      <div role="alert" className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">No pudimos cargar esta información</h1>
        <p className="text-base text-muted-foreground">Revisa tu conexión e inténtalo de nuevo.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button type="button" onClick={() => retry()} className={cn(buttonVariants({ className: "h-12 w-full rounded-full text-base" }))}>
          Reintentar
        </button>
        <Link href={rutaDeInicio} className={cn(buttonVariants({ variant: "outline", className: "h-12 w-full rounded-full text-base" }))}>
          {etiquetaDeInicio}
        </Link>
      </div>
      {digest !== undefined && (
        <p className="text-sm text-muted-foreground">
          Código de soporte: <span className="font-mono">{digest}</span>
        </p>
      )}
    </div>
  );
}
