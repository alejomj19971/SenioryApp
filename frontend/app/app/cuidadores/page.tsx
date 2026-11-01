import { BuscadorCuidadores } from "@/components/cuidadores/buscador-cuidadores";
import { filtrosDeConsulta } from "@/lib/filtros-de-cuidadores";
import { listarCuidadores, obtenerOpcionesDeBusqueda } from "@/lib/services/cuidadores";

export const metadata = {
  title: "Buscar cuidador",
};

export default async function CuidadoresPage({ searchParams }: PageProps<"/app/cuidadores">) {
  // Los filtros vienen de la URL (se pueden compartir); lo inválido se descarta, no rompe la página.
  const filtros = filtrosDeConsulta(await searchParams);
  const [pagina, opciones] = await Promise.all([listarCuidadores(filtros), obtenerOpcionesDeBusqueda()]);

  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Buscar cuidador</h1>
        <p className="text-base text-muted-foreground">
          Todos los perfiles están verificados.
        </p>
      </div>
      <BuscadorCuidadores
        cuidadores={pagina.cuidadores}
        siguiente={pagina.siguiente}
        filtros={filtros}
        zonas={opciones.zonas}
        tarifaLimite={opciones.tarifaMaxima}
      />
    </div>
  );
}
