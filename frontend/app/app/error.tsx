"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Lo que se ve cuando algo falla al cargar una pantalla de /app (F0 §4.8, E1: «si algo falla, el
// usuario recibe un mensaje claro»). Nunca se muestra `error.message`: en errores del servidor Next ya
// lo reemplaza por un texto genérico, y en los del navegador podría traer detalles internos.
export default function ErrorDeLaApp({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      </span>
      <div role="alert" className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">No pudimos cargar esta información</h1>
        <p className="text-base text-muted-foreground">
          Revisa tu conexión e inténtalo de nuevo.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className={cn(buttonVariants({ className: "h-12 w-full rounded-full text-base" }))}
        >
          Reintentar
        </button>
        <Link
          href="/app"
          className={cn(
            buttonVariants({ variant: "outline", className: "h-12 w-full rounded-full text-base" }),
          )}
        >
          Ir al inicio
        </Link>
      </div>
      {error.digest !== undefined && (
        <p className="text-sm text-muted-foreground">
          Código de soporte: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
