import type { Metadata } from "next";
import Link from "next/link";
import { ColaDeRevision } from "@/components/admin/cola-de-revision";
import { buttonVariants } from "@/components/ui/button";
import { agruparPorCuidador } from "@/lib/agrupar-revision";
import { exigirRol } from "@/lib/sesion";
import { ESTADOS_DE_LA_COLA, listarCola, listarHojasPorRevisar, type EstadoDeLaCola } from "@/lib/services/verificaciones";

export const metadata: Metadata = { title: "Panel de revisión" };

// El backend entrega hasta 50 verificaciones por estado, las más antiguas primero.
const LIMITE_DE_LA_COLA = 50;

const NOMBRE_DEL_ESTADO: Record<EstadoDeLaCola, string> = {
  pendiente: "Por revisar",
  aprobada: "Aprobadas",
  rechazada: "Rechazadas",
  vencida: "Vencidas",
};

// La cola de los revisores (F9): cada control que un cuidador pidió verificar, con sus documentos para abrirlos y la
// decisión. Solo administradores; cada decisión y cada apertura de un documento queda en la auditoría del backend.
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const perfil = await exigirRol("administrador");
  const pedido = (await searchParams).estado;
  const estado: EstadoDeLaCola = ESTADOS_DE_LA_COLA.find((e) => e === pedido) ?? "pendiente";
  const [cola, hojas] = await Promise.all([listarCola(estado), estado === "pendiente" ? listarHojasPorRevisar() : Promise.resolve([])]);
  const grupos = agruparPorCuidador(cola, hojas);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Panel de revisión</h1>
        <p className="text-base text-muted-foreground">Hola, {perfil.usuario.nombre.split(" ")[0]}. Cada decisión y cada documento que abres queda registrado.</p>
      </div>

      <nav aria-label="Estado de las verificaciones" className="flex flex-wrap gap-2">
        {ESTADOS_DE_LA_COLA.map((e) => (
          <Link
            key={e}
            href={e === "pendiente" ? "/admin" : `/admin?estado=${e}`}
            aria-current={e === estado ? "page" : undefined}
            className={buttonVariants({ variant: e === estado ? "default" : "outline" })}
          >
            {NOMBRE_DEL_ESTADO[e]}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="verificaciones" className="flex flex-col gap-4">
        <h2 id="verificaciones" className="text-lg font-semibold text-foreground">
          Verificaciones — {NOMBRE_DEL_ESTADO[estado].toLowerCase()} <span className="font-normal text-muted-foreground">({grupos.length})</span>
        </h2>
        {estado === "pendiente" && <p className="text-base text-muted-foreground">Un cuidador puede tener varios controles y su hoja de vida a la vez: aquí van todos juntos, no por separado.</p>}
        {cola.length >= LIMITE_DE_LA_COLA && (
          <p className="rounded-2xl bg-muted p-4 text-base text-foreground">
            Se muestran las {LIMITE_DE_LA_COLA} más antiguas de este estado. Al decidir estas, aparecen las siguientes.
          </p>
        )}
        <ColaDeRevision
          grupos={grupos}
          vacioTitulo={estado === "pendiente" ? "No hay nada por revisar" : "No hay verificaciones en este estado"}
        />
      </section>
    </div>
  );
}
