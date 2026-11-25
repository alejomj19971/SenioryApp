import type { Metadata } from "next";
import { EncabezadoConAnalisis } from "@/components/admin/encabezado-con-analisis";
import { ListadoDeCuidadores } from "@/components/admin/listado-de-cuidadores";
import { ResumenDelPanel } from "@/components/admin/resumen-del-panel";
import { direccionDelListado } from "@/lib/direccion-del-listado";
import { exigirRol } from "@/lib/sesion";
import { estadoDelPanelDesdeTexto, listarCuidadoresDelPanel } from "@/lib/services/cuidadores-del-panel";
import { obtenerEstadisticasDeCuidadores, obtenerEstadisticasDeServicios } from "@/lib/services/estadisticas";

export const metadata: Metadata = { title: "Panel del administrador" };

// El inicio del administrador: lo primero es la lista de todos los cuidadores con su estado y su calificación, con un
// buscador. El análisis (cómo van los servicios y los cuidadores) está detrás de un botón: abrirlo pone `?analisis=1` en la
// dirección y solo entonces se calcula. Las verificaciones por revisar están en su propia sección del menú.
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const perfil = await exigirRol("administrador");
  const parametros = await searchParams;
  // Un parámetro repetido llega como lista: se toma el primero.
  const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);
  const busqueda = (primero(parametros.busqueda) ?? "").trim().slice(0, 200);
  const estado = estadoDelPanelDesdeTexto(primero(parametros.estado));
  const analisis = primero(parametros.analisis) === "1";

  // El análisis no debe tumbar el listado: si no se puede leer, su tarjeta lo avisa y lo demás sigue. Y si está cerrado,
  // ni se pide (la búsqueda vuelve a esta página en cada cambio).
  const [listado, servicios, cuidadores] = await Promise.all([
    listarCuidadoresDelPanel({ busqueda, ...(estado === undefined ? {} : { estado }) }),
    analisis ? obtenerEstadisticasDeServicios().catch(() => null) : Promise.resolve(null),
    analisis ? obtenerEstadisticasDeCuidadores().catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoConAnalisis
        titulo="Panel del administrador"
        subtitulo={`Hola, ${perfil.usuario.nombre.split(" ")[0]}. Estos son tus cuidadores.`}
        abierto={analisis}
        direccionAlternada={direccionDelListado(busqueda, estado, !analisis)}
      />

      {analisis && <ResumenDelPanel servicios={servicios} cuidadores={cuidadores} />}

      <section aria-labelledby="cuidadores" className="flex flex-col gap-4">
        <h2 id="cuidadores" className="text-lg font-semibold text-foreground">
          Cuidadores <span className="font-normal text-muted-foreground">({listado.cuidadores.length}{listado.hayMas ? "+" : ""})</span>
        </h2>
        <ListadoDeCuidadores cuidadores={listado.cuidadores} hayMas={listado.hayMas} busqueda={busqueda} estado={estado} analisis={analisis} />
      </section>
    </div>
  );
}
