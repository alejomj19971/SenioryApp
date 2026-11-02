import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, Inbox, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { TarjetaDeSolicitud } from "@/components/cuidador/tarjeta-de-solicitud";
import { resumenDeLaPostulacion } from "@/lib/etiquetas-de-postulacion";
import { exigirRol } from "@/lib/sesion";
import { obtenerMiPerfil } from "@/lib/services/postulacion";
import { listarServiciosDelCuidador } from "@/lib/services/servicios";
import type { EstadoDeServicio, ServicioDelCuidador } from "@/lib/types";

export const metadata: Metadata = { title: "Tu panel de cuidador" };

const GRUPOS: { titulo: string; estados: EstadoDeServicio[] }[] = [
  { titulo: "Por responder", estados: ["solicitado"] },
  { titulo: "En curso", estados: ["en_curso"] },
  { titulo: "Próximos", estados: ["aceptado"] },
  { titulo: "Anteriores", estados: ["finalizado", "cancelado"] },
];

// El panel del cuidador (F4): sus solicitudes y servicios. Lo que recibe por cada uno; nunca lo que paga la familia.
// Quien todavía no armó su perfil empieza por ahí (F9); quien no está verificado ve cómo va su postulación.
export default async function CuidadorPage() {
  const perfil = await exigirRol("cuidador");
  const miPerfil = await obtenerMiPerfil();
  if (miPerfil === null) redirect("/cuidador/perfil");
  const postulacion = resumenDeLaPostulacion(miPerfil);
  const pagina = await listarServiciosDelCuidador();
  const por = (estados: EstadoDeServicio[]): ServicioDelCuidador[] => pagina.servicios.filter((servicio) => estados.includes(servicio.estado));

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hola, {perfil.usuario.nombre.split(" ")[0]}</h1>
        <p className="text-base text-muted-foreground">Tus solicitudes y servicios.</p>
      </div>

      <Link
        href="/cuidador/perfil"
        className={`flex items-center gap-3 rounded-2xl p-4 ring-1 transition-colors hover:ring-primary/40 ${postulacion.tono === "exito" ? "bg-card ring-border" : postulacion.tono === "atencion" ? "bg-destructive/5 ring-destructive" : "bg-muted ring-border"}`}
      >
        {postulacion.tono === "exito" ? <ShieldCheck className="size-6 shrink-0 text-success" aria-hidden="true" /> : <UserRound className="size-6 shrink-0 text-primary" aria-hidden="true" />}
        <span>
          <span className="block text-base font-semibold text-foreground">{postulacion.tono === "exito" ? "Tu perfil y tus documentos" : postulacion.titulo}</span>
          <span className="block text-sm text-muted-foreground">{postulacion.tono === "exito" ? "Estás verificado: las familias te ven" : postulacion.explicacion}</span>
        </span>
      </Link>

      <Link href="/cuidador/liquidaciones" className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:ring-primary/40">
        <Banknote className="size-6 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <span className="block text-base font-semibold text-foreground">Tus pagos</span>
          <span className="block text-sm text-muted-foreground">Lo que te debemos y lo que ya te pagamos</span>
        </span>
      </Link>

      <Link href="/cuidador/mensajes" className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:ring-primary/40">
        <MessageCircle className="size-6 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <span className="block text-base font-semibold text-foreground">Mensajes</span>
          <span className="block text-sm text-muted-foreground">Tus conversaciones con las familias</span>
        </span>
      </Link>

      {pagina.servicios.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
          <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">Todavía no tienes solicitudes</p>
          <p className="text-base text-muted-foreground">Cuando una familia te pida, te avisamos y la verás aquí.</p>
        </div>
      )}

      {GRUPOS.map(({ titulo, estados }) => {
        const servicios = por(estados);
        if (servicios.length === 0) return null;
        return (
          <section key={titulo} aria-label={titulo} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              {titulo} <span className="font-normal text-muted-foreground">({servicios.length})</span>
            </h2>
            {servicios.map((servicio) => (
              <TarjetaDeSolicitud key={servicio.id} servicio={servicio} />
            ))}
          </section>
        );
      })}

      {pagina.siguiente !== null && (
        <p className="text-sm text-muted-foreground">Mostrando los más recientes. Los anteriores llegan con el historial completo.</p>
      )}
    </div>
  );
}
