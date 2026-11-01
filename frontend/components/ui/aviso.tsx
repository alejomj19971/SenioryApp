import * as React from "react"
import { CircleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

type AvisoProps = {
  titulo: string
  descripcion?: string
  accion?: React.ReactNode // p. ej. <Button variant="outline" size="sm" onClick={onReintentar}><RotateCcw />Reintentar</Button>
  className?: string
}

/** Aviso de error en pantalla: es el estado «error» obligatorio de cada pantalla. */
function Aviso({ titulo, descripcion, accion, className }: AvisoProps) {
  return (
    <div
      role="alert"
      data-slot="aviso"
      className={cn(
        "flex gap-3 rounded-lg border border-destructive bg-destructive/5 p-4",
        className
      )}
    >
      <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-base font-semibold text-foreground">{titulo}</p>
        {descripcion && <p className="text-sm text-foreground">{descripcion}</p>}
        {accion && <div className="pt-1">{accion}</div>}
      </div>
    </div>
  )
}

export { Aviso }
export type { AvisoProps }
