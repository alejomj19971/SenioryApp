import type { Metadata } from "next";
import { ListadoDeCuidadores } from "@/components/admin/listado-de-cuidadores";
import { PestanasDelPanel } from "@/components/admin/pestanas-del-panel";
import { ResumenDelPanel } from "@/components/admin/resumen-del-panel";
import { exigirRol } from "@/lib/sesion";
import { listarCuidadoresDelPanel, estadoDelPanelDesdeTexto } from "@/lib/services/cuidadores-del-panel";
import { obtenerEstadisticasDeCuidadores, obtenerEstadisticasDeServicios } from "@/lib/services/estadisticas";

export const metadata: Metadata = { title: "Panel del administrador" };

// El inicio del administrador: cómo van los servicios y los cuidadores, y la lista de todos los cuidadores con su estado y
// su calificación, con un buscador. Las verificaciones por revisar están en la otra pestaña.
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const perfil = await exigirRol("administrador");
  const parametros = await searchParams;
  // Un parámetro repetido llega como lista: se toma el primero.
  const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);
  const busqueda = (primero(parametros.busqueda) ?? "").trim().slice(0, 200);
  const estado = estadoDelPanelDesdeTexto(primero(parametros.estado));

  // El resumen no debe tumbar el listado: si no se puede leer, su tarjeta lo avisa y lo demás sigue.
  const [listado, servicios, cuidadores] = await Promise.all([
    listarCuidadoresDelPanel({ busqueda, ...(estado === undefined ? {} : { estado }) }),
    obtenerEstadisticasDeServicios().catch(() => null),
    obtenerEstadisticasDeCuidadores().catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Panel del administrador</h1>
        <p className="text-base text-muted-foreground">Hola, {perfil.usuario.nombre.split(" ")[0]}. Así van los servicios y los cuidadores.</p>
      </div>

      <ResumenDelPanel servicios={servicios} cuidadores={cuidadores} />

      <PestanasDelPanel activa="cuidadores" />

      <section aria-labelledby="cuidadores" className="flex flex-col gap-4">
        <h2 id="cuidadores" className="text-lg font-semibold text-foreground">
          Cuidadores <span className="font-normal text-muted-foreground">({listado.cuidadores.length}{listado.hayMas ? "+" : ""})</span>
        </h2>
        <ListadoDeCuidadores cuidadores={listado.cuidadores} hayMas={listado.hayMas} busqueda={busqueda} estado={estado} />
      </section>
    </div>
  );
}
