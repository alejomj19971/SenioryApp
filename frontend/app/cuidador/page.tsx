import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { TarjetaDeSolicitud } from "@/components/cuidador/tarjeta-de-solicitud";
import { exigirRol } from "@/lib/sesion";
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
// El perfil y los documentos para verificarse llegan en F9, y sus pagos en F7.
export default async function CuidadorPage() {
  const perfil = await exigirRol("cuidador");
  const pagina = await listarServiciosDelCuidador();
  const por = (estados: EstadoDeServicio[]): ServicioDelCuidador[] => pagina.servicios.filter((servicio) => estados.includes(servicio.estado));

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hola, {perfil.usuario.nombre.split(" ")[0]}</h1>
        <p className="text-base text-muted-foreground">Tus solicitudes y servicios.</p>
      </div>

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
