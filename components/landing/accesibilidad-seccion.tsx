import { Mic, Contrast, TextCursorInput } from "lucide-react";

const caracteristicas = [
  {
    icono: Mic,
    titulo: "Comando de voz",
    descripcion: '"Buscar cuidador", "teleasistencia" o "ayuda", sin necesidad de escribir.',
  },
  {
    icono: Contrast,
    titulo: "Alto contraste",
    descripcion: "Un toque para activar un tema con mayor contraste y legibilidad.",
  },
  {
    icono: TextCursorInput,
    titulo: "Letra grande",
    descripcion: "Texto ajustable en tres tamaños, pensado para ojos que ya no ven como antes.",
  },
];

export function AccesibilidadSeccion() {
  return (
    <section className="bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto grid max-w-4xl items-center gap-8 sm:gap-12 md:grid-cols-[220px_1fr]">
          <div className="relative mx-auto w-44 sm:w-52 md:w-full">
            <div className="absolute -top-4 -left-4 size-20 rounded-full bg-accent/20 blur-2xl" aria-hidden="true" />
            <div className="absolute -right-3 -bottom-5 size-24 rounded-full bg-primary/15 blur-2xl" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/dona-carmen.jpg"
              alt="Mujer mayor sonriendo, representando a las personas mayores que usan Seniory"
              className="relative aspect-4/5 w-full rounded-3xl object-cover shadow-lg ring-4 ring-background"
            />
          </div>
          <div className="text-center md:text-left">
            <span className="inline-flex rounded-full bg-accent/15 px-4 py-1.5 text-sm font-semibold text-accent">
              Nuestro diferencial
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Pensada también para el adulto mayor
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              La accesibilidad no es un extra: doña Carmen y personas como ella
              deben poder usar Seniory por sí mismas.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {caracteristicas.map(({ icono: Icono, titulo, descripcion }) => (
            <div
              key={titulo}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-accent/25 bg-card p-7 text-center shadow-sm"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Icono className="size-7" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-semibold text-foreground">{titulo}</h3>
              <p className="text-base text-muted-foreground">{descripcion}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
