import Link from "next/link";
import { ShieldCheck, Star } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="overflow-hidden bg-gradient-to-b from-secondary/60 to-background">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
            Creciendo y cuidando juntos
          </span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
            Dejar solos a tus padres todo el día no debería darte tanta angustia.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground sm:text-xl">
            Seniory conecta a tu familia con cuidadores verificados por horas y
            te da teleasistencia <strong className="text-foreground">gratuita</strong> para
            saber, en tiempo real, que todo está bien.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/app"
              className={buttonVariants({
                size: "lg",
                className: "h-14 rounded-full px-8 text-lg",
              })}
            >
              Probar la app
            </Link>
            <a
              href="#servicios"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "h-14 rounded-full px-8 text-lg",
              })}
            >
              Ver cómo funciona
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            Cuidadores con antecedentes, títulos y prueba psicotécnica verificados.
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/pareja-caminando.jpg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] object-cover opacity-90 [mask-image:radial-gradient(closest-side,black_70%,transparent_100%)] sm:-inset-16"
          />
          <div className="absolute -top-6 -left-6 size-28 rounded-full bg-accent/20 blur-2xl" aria-hidden="true" />
          <div className="absolute -bottom-8 -right-4 size-32 rounded-full bg-primary/15 blur-2xl" aria-hidden="true" />
          <div className="absolute -top-5 -right-5 z-10 flex size-16 items-center justify-center rounded-full bg-card p-1.5 shadow-xl ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="" className="size-full object-contain" />
          </div>
          <div className="relative rounded-[2.5rem] border-8 border-foreground/90 bg-card p-3 shadow-2xl">
            <div className="rounded-[1.75rem] bg-background p-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">
                  ME
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Marta Elena Restrepo</p>
                  <p className="text-xs text-muted-foreground">Técnica en Enfermería</p>
                </div>
              </div>
              <div className="mb-4 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <ShieldCheck className="size-3.5" aria-hidden="true" /> Verificado
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
                  <Star className="size-3.5 fill-accent" aria-hidden="true" /> 4.9
                </span>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Tarifa por hora</p>
                <p className="text-lg font-bold text-foreground">$20.000</p>
              </div>
              <div className="mt-3 flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">
                Contratar por horas
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
