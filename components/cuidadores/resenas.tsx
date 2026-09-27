import { Star } from "lucide-react";
import type { Resena } from "@/lib/types";
import { formatearFecha } from "@/lib/format";

export function Resenas({ resenas }: { resenas: Resena[] }) {
  if (resenas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay reseñas para este cuidador.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {resenas.map((resena, indice) => (
        <li key={`${resena.autor}-${indice}`} className="rounded-xl bg-muted p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{resena.autor}</p>
            <div className="flex items-center gap-0.5" aria-label={`${resena.calificacion} de 5 estrellas`}>
              {Array.from({ length: 5 }).map((_, indiceEstrella) => (
                <Star
                  key={indiceEstrella}
                  className={
                    indiceEstrella < resena.calificacion
                      ? "size-3.5 fill-accent text-accent"
                      : "size-3.5 text-border"
                  }
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{resena.comentario}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatearFecha(resena.fecha)}
          </p>
        </li>
      ))}
    </ul>
  );
}
