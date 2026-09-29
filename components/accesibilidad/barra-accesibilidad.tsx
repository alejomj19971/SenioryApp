"use client";

import { Contrast } from "lucide-react";
import { useAccesibilidad, type TamanoTexto } from "@/components/accesibilidad/accesibilidad-provider";
import { BotonVoz } from "@/components/accesibilidad/boton-voz";
import { cn } from "@/lib/utils";

const tamanos: { valor: TamanoTexto; etiqueta: string }[] = [
  { valor: "normal", etiqueta: "A" },
  { valor: "grande", etiqueta: "A+" },
  { valor: "muy-grande", etiqueta: "A++" },
];

export function BarraAccesibilidad() {
  const { contraste, alternarContraste, tamanoTexto, setTamanoTexto } = useAccesibilidad();

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2">
      <div
        role="group"
        aria-label="Tamaño del texto"
        className="flex items-center gap-1 rounded-full bg-background p-1 ring-1 ring-border"
      >
        {tamanos.map(({ valor, etiqueta }) => (
          <button
            key={valor}
            type="button"
            onClick={() => setTamanoTexto(valor)}
            aria-pressed={tamanoTexto === valor}
            aria-label={`Tamaño de texto ${etiqueta}`}
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-bold transition-colors",
              tamanoTexto === valor
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={alternarContraste}
            aria-pressed={contraste === "alto"}
            aria-label="Alternar modo de alto contraste"
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              contraste === "alto"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50",
            )}
          >
            <Contrast className="size-5" aria-hidden="true" />
          </button>
          <span className="text-[10px] font-medium text-muted-foreground">Contraste</span>
        </div>
        <BotonVoz />
      </div>
    </div>
  );
}
