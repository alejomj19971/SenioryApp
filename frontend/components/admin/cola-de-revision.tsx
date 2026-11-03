"use client";

import { useState } from "react";
import { Search, SearchX } from "lucide-react";
import { TarjetaDePersona } from "@/components/admin/tarjeta-de-persona";
import type { GrupoDeRevision } from "@/lib/agrupar-revision";

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// La cola ya agrupada por persona (F9): el buscador filtra en el cliente, sin volver a pedirle nada al servidor —
// hasta 50 personas por estado, no hace falta más.
export function ColaDeRevision({ grupos, vacioTitulo, vacioDescripcion }: { grupos: GrupoDeRevision[]; vacioTitulo: string; vacioDescripcion?: string }) {
  const [busqueda, setBusqueda] = useState("");
  const filtrados = busqueda.trim() === "" ? grupos : grupos.filter((grupo) => normalizar(grupo.nombre).includes(normalizar(busqueda)));

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
        <p className="text-base font-medium text-foreground">{vacioTitulo}</p>
        {vacioDescripcion !== undefined && <p className="text-sm text-muted-foreground">{vacioDescripcion}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar cuidador por nombre…"
          aria-label="Buscar cuidador por nombre"
          className="h-12 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">No encontramos a nadie con ese nombre</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {filtrados.map((grupo) => (
            <TarjetaDePersona key={grupo.cuidadorId} grupo={grupo} />
          ))}
        </ul>
      )}
    </div>
  );
}
