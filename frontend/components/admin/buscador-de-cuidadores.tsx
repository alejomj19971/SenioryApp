"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import type { EstadoDeCuidadorEnElPanel } from "@/lib/estados-de-cuidador";
import { direccionDelListado } from "@/lib/direccion-del-listado";

// Cuánto espera después de la última tecla antes de buscar: lo justo para no consultar en cada letra.
const ESPERA_MS = 300;

interface BuscadorDeCuidadoresProps {
  // Si el análisis está abierto: se conserva al buscar.
  analisis?: boolean;
  // Lo que se está buscando ahora (viene de la dirección); el filtro de estado se conserva al buscar.
  busqueda: string;
  estado: EstadoDeCuidadorEnElPanel | undefined;
}

// El buscador del listado: busca mientras se escribe, sin recargar la página ni perder el cursor. Cambia la dirección
// (`?busqueda=…`) con `replace`, así que no llena el historial y el resultado se puede copiar. Enter busca al instante, y sin
// JavaScript sigue funcionando como un formulario normal.
export function BuscadorDeCuidadores({ busqueda, estado, analisis = false }: BuscadorDeCuidadoresProps) {
  const router = useRouter();
  const [texto, setTexto] = useState(busqueda);
  const [buscando, iniciar] = useTransition();
  // Lo último que se pidió: así se sabe que una respuesta que llega es la nuestra y no se pisa lo que ya se escribió después.
  const [enviado, setEnviado] = useState(busqueda);
  const [anterior, setAnterior] = useState(busqueda);

  // Si la búsqueda cambia desde fuera (por ejemplo «Quitar filtros»), el campo la sigue.
  if (busqueda !== anterior) {
    setAnterior(busqueda);
    if (busqueda !== enviado) {
      setEnviado(busqueda);
      setTexto(busqueda);
    }
  }

  const buscar = useCallback(
    (valor: string) => {
      setEnviado(valor);
      iniciar(() => router.replace(direccionDelListado(valor, estado, analisis), { scroll: false }));
    },
    [estado, analisis, router],
  );

  useEffect(() => {
    const valor = texto.trim();
    if (valor === enviado) return;
    const espera = setTimeout(() => buscar(valor), ESPERA_MS);
    return () => clearTimeout(espera);
  }, [texto, enviado, buscar]);

  return (
    <form
      action="/admin"
      method="get"
      role="search"
      className="relative"
      onSubmit={(evento) => {
        evento.preventDefault();
        const valor = texto.trim();
        if (valor !== enviado) buscar(valor);
      }}
    >
      {estado !== undefined && <input type="hidden" name="estado" value={estado} />}
      {analisis && <input type="hidden" name="analisis" value="1" />}
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        name="busqueda"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        maxLength={200}
        autoComplete="off"
        placeholder="Buscar cuidador por nombre o zona…"
        aria-label="Buscar cuidador por nombre o zona"
        className="h-12 w-full rounded-lg border border-input bg-card pl-9 pr-10 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {buscando ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          texto !== "" && (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                if (enviado !== "") buscar("");
              }}
              aria-label="Borrar la búsqueda"
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )
        )}
      </div>
      <p role="status" className="sr-only">
        {buscando ? "Buscando…" : ""}
      </p>
    </form>
  );
}
