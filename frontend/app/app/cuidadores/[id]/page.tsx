import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Star, MapPin, Briefcase, ShieldCheck, Stethoscope, FileText } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { BadgesVerificacion } from "@/components/cuidadores/badges-verificacion";
import { Resenas } from "@/components/cuidadores/resenas";
import { buttonVariants } from "@/components/ui/button";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import { etiquetaEspecialidad, etiquetaJornada, formatearCOP } from "@/lib/format";

export default async function PerfilCuidadorPage({
  params,
}: PageProps<"/app/cuidadores/[id]">) {
  const { id } = await params;
  const cuidador = await obtenerCuidador(id);

  if (!cuidador) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-28">
      <Link
        href="/app/cuidadores"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a la búsqueda
      </Link>

      <div className="flex items-center gap-4">
        <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" className="size-20 ring-4 ring-primary/10" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{cuidador.nombre}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Verificado
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{cuidador.titulo}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-sm font-semibold text-accent">
              <Star className="size-4 fill-accent text-accent" aria-hidden="true" />
              {cuidador.calificacion.toFixed(1)}
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Briefcase className="size-4" aria-hidden="true" />
              {cuidador.serviciosCompletados} servicios
            </span>
          </div>
        </div>
      </div>

      <section aria-label="Verificación del cuidador">
        <BadgesVerificacion verificacion={cuidador.verificacion} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">Sobre {cuidador.nombre.split(" ")[0]}</h2>
        <p className="text-base text-muted-foreground">{cuidador.bio}</p>
      </section>

      {cuidador.hojaDeVida && (
        <a
          href={cuidador.hojaDeVida}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl bg-muted p-4 ring-1 ring-border transition-colors hover:ring-primary/40"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Hoja de vida</p>
            <p className="text-xs text-muted-foreground">Ver el documento completo en PDF</p>
          </div>
        </a>
      )}

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted p-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Stethoscope className="size-3.5" aria-hidden="true" /> Especialidad
          </p>
          <p className="text-sm font-semibold text-foreground">
            {etiquetaEspecialidad(cuidador.especialidad)}
          </p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden="true" /> Zona
          </p>
          <p className="text-sm font-semibold text-foreground">{cuidador.zona}</p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">Disponibilidad</h2>
        <div className="flex flex-wrap gap-2">
          {cuidador.disponibilidad.map((jornada) => (
            <span
              key={jornada}
              className="rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground"
            >
              {etiquetaJornada(jornada)}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          Reseñas de otras familias
        </h2>
        <Resenas resenas={cuidador.resenas} />
      </section>

      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
        <Link
          href={`/app/contratar/${cuidador.id}`}
          className={buttonVariants({
            className: "h-14 w-full rounded-full text-base shadow-lg shadow-primary/25",
          })}
        >
          <ShieldCheck className="size-5" aria-hidden="true" />
          Contratar por horas — {formatearCOP(cuidador.tarifaHora)}/hora
        </Link>
      </div>
    </div>
  );
}
