import Link from "next/link";
import { SearchX, Star } from "lucide-react";
import { BuscadorDeCuidadores } from "@/components/admin/buscador-de-cuidadores";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { buttonVariants } from "@/components/ui/button";
import { ESTADOS_DE_CUIDADOR_EN_EL_PANEL, type EstadoDeCuidadorEnElPanel } from "@/lib/estados-de-cuidador";
import { direccionDelListado } from "@/lib/direccion-del-listado";
import { etiquetaEspecialidad } from "@/lib/format";
import type { CuidadorDelPanel } from "@/lib/services/cuidadores-del-panel";
import { cn } from "@/lib/utils";

const NOMBRE_DEL_ESTADO: Record<EstadoDeCuidadorEnElPanel, string> = {
  activo: "Activos",
  en_revision: "En revisión",
  borrador: "En borrador",
  suspendido: "Suspendidos",
};

// El estado de un vistazo: etiqueta y color. Un cuidador «activo» que aun así no se ve en el directorio (le falta o se le
// venció un control) se distingue del que sí se ve, porque es justo el que el administrador necesita atender.
function estadoVisible(cuidador: CuidadorDelPanel): { texto: string; clases: string } {
  switch (cuidador.estado) {
    case "activo":
      return cuidador.visible
        ? { texto: "Visible", clases: "bg-success text-success-foreground" }
        : { texto: "Activo, no visible", clases: "bg-warning text-warning-foreground" };
    case "en_revision":
      return { texto: "En revisión", clases: "bg-primary/10 text-primary" };
    case "suspendido":
      return { texto: "Suspendido", clases: "bg-destructive text-destructive-foreground" };
    default:
      return { texto: "Borrador", clases: "bg-muted text-muted-foreground" };
  }
}


interface ListadoDeCuidadoresProps {
  cuidadores: CuidadorDelPanel[];
  hayMas: boolean;
  busqueda: string;
  estado: EstadoDeCuidadorEnElPanel | undefined;
  // Si el análisis está abierto: se conserva al buscar y al filtrar.
  analisis?: boolean;
}

// Todos los cuidadores con su estado y su calificación, para reconocerlos de un vistazo. La búsqueda va mientras se escribe
// y deja la dirección compartible (`/admin?busqueda=…&estado=…`); sin JavaScript sigue siendo un formulario normal.
export function ListadoDeCuidadores({ cuidadores, hayMas, busqueda, estado, analisis = false }: ListadoDeCuidadoresProps) {
  const hayFiltro = busqueda !== "" || estado !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <BuscadorDeCuidadores busqueda={busqueda} estado={estado} analisis={analisis} />

      <nav aria-label="Filtrar cuidadores por estado" className="flex flex-wrap gap-2">
        <Link href={direccionDelListado(busqueda, undefined, analisis)} scroll={false} aria-current={estado === undefined ? "page" : undefined} className={buttonVariants({ variant: estado === undefined ? "default" : "outline" })}>
          Todos
        </Link>
        {ESTADOS_DE_CUIDADOR_EN_EL_PANEL.map((e) => (
          <Link key={e} href={direccionDelListado(busqueda, e, analisis)} scroll={false} aria-current={e === estado ? "page" : undefined} className={buttonVariants({ variant: e === estado ? "default" : "outline" })}>
            {NOMBRE_DEL_ESTADO[e]}
          </Link>
        ))}
      </nav>

      {cuidadores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">{hayFiltro ? "Ningún cuidador coincide con tu búsqueda" : "Todavía no hay cuidadores registrados"}</p>
          {hayFiltro && (
            <Link href={direccionDelListado("", undefined, analisis)} scroll={false} className={buttonVariants({ variant: "outline" })}>
              Quitar filtros
            </Link>
          )}
        </div>
      ) : (
        <ul aria-label="Cuidadores" className="grid gap-3 sm:grid-cols-2">
          {cuidadores.map((cuidador) => {
            const etiqueta = estadoVisible(cuidador);
            return (
              <li key={cuidador.id} aria-label={cuidador.nombre}>
                <Link
                  href={`/admin/cuidadores/${cuidador.id}`}
                  className="flex h-full gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-base font-semibold text-foreground">{cuidador.nombre}</p>
                  <p className="text-sm text-muted-foreground">
                    {etiquetaEspecialidad(cuidador.especialidad)} · {cuidador.zona}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", etiqueta.clases)}>{etiqueta.texto}</span>
                    {cuidador.calificacion !== null ? (
                      <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                        <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                        {cuidador.calificacion.toFixed(1)}
                        <span className="font-normal text-muted-foreground">({cuidador.cantidadResenas})</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin reseñas</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {cuidador.serviciosCompletados} {cuidador.serviciosCompletados === 1 ? "servicio completado" : "servicios completados"}
                    </p>
                    <span className="text-xs font-medium text-primary">Ver verificación y documentos</span>
                  </div>
                </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {hayMas && <p className="rounded-2xl bg-muted p-4 text-base text-foreground">Se muestran los primeros resultados. Escribe en el buscador para afinar.</p>}
    </div>
  );
}
