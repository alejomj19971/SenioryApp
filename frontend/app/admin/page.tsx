import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { TarjetaDeHojaDeVida, TarjetaDeVerificacion } from "@/components/admin/tarjeta-de-verificacion";
import { buttonVariants } from "@/components/ui/button";
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
          Verificaciones — {NOMBRE_DEL_ESTADO[estado].toLowerCase()} <span className="font-normal text-muted-foreground">({cola.length})</span>
        </h2>
        {cola.length >= LIMITE_DE_LA_COLA && (
          <p className="rounded-2xl bg-muted p-4 text-base text-foreground">
            Se muestran las {LIMITE_DE_LA_COLA} más antiguas de este estado. Al decidir estas, aparecen las siguientes.
          </p>
        )}
        {cola.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
            <ClipboardCheck className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-base font-medium text-foreground">{estado === "pendiente" ? "No hay verificaciones por revisar" : "No hay verificaciones en este estado"}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {cola.map((verificacion) => (
              <TarjetaDeVerificacion key={verificacion.id} verificacion={verificacion} />
            ))}
          </ul>
        )}
      </section>

      {estado === "pendiente" && (
        <section aria-labelledby="hojas" className="flex flex-col gap-4">
          <h2 id="hojas" className="text-lg font-semibold text-foreground">
            Hojas de vida por aprobar <span className="font-normal text-muted-foreground">({hojas.length})</span>
          </h2>
          <p className="text-base text-muted-foreground">Es el único documento que ven las familias: revísalo antes de aprobarlo.</p>
          {hojas.length === 0 ? (
            <p className="rounded-2xl bg-muted p-6 text-center text-base text-muted-foreground">No hay hojas de vida por revisar.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {hojas.map((hoja) => (
                <TarjetaDeHojaDeVida key={hoja.documento.id} hoja={hoja} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
