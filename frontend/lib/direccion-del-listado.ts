import type { EstadoDeCuidadorEnElPanel } from "@/lib/estados-de-cuidador";

// La dirección del listado de cuidadores del panel con su búsqueda y su filtro de estado: `/admin?busqueda=…&estado=…`.
// Va en un módulo aparte (sin "use client") para que la usen tanto el servidor como el buscador del navegador.
export function direccionDelListado(busqueda: string, estado: EstadoDeCuidadorEnElPanel | undefined): string {
  const parametros = new URLSearchParams();
  if (busqueda !== "") parametros.set("busqueda", busqueda);
  if (estado !== undefined) parametros.set("estado", estado);
  const texto = parametros.toString();
  return texto === "" ? "/admin" : `/admin?${texto}`;
}
