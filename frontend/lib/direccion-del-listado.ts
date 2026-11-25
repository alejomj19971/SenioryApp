import type { EstadoDeCuidadorEnElPanel } from "@/lib/estados-de-cuidador";

// La dirección del listado de cuidadores del panel con su búsqueda, su filtro de estado y si el análisis está abierto:
// `/admin?busqueda=…&estado=…&analisis=1`. Va en un módulo aparte (sin "use client") para que la usen tanto el servidor como
// el buscador del navegador.
export function direccionDelListado(busqueda: string, estado: EstadoDeCuidadorEnElPanel | undefined, analisis = false): string {
  const parametros = new URLSearchParams();
  if (busqueda !== "") parametros.set("busqueda", busqueda);
  if (estado !== undefined) parametros.set("estado", estado);
  if (analisis) parametros.set("analisis", "1");
  const texto = parametros.toString();
  return texto === "" ? "/admin" : `/admin?${texto}`;
}
