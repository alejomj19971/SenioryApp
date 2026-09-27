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
            Dejar sola a mamá todo el día no debería darte tanta angustia.
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
          <div className="absolute -top-6 -left-6 size-28 rounded-full bg-accent/20 blur-2xl" aria-hidden="true" />
          <div className="absolute -bottom-8 -right-4 size-32 rounded-full bg-primary/15 blur-2xl" aria-hidden="true" />
          <div className="relative rounded-[2.5rem] border-8 border-foreground/90 bg-card p-3 shadow-2xl">
            <div className="rounded-[1.75rem] bg-background p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="size-9 rounded-full bg-primary" aria-hidden="true" />
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
              <div className="mt-3 h-10 rounded-full bg-primary" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
