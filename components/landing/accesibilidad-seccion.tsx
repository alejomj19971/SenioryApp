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
    <section className="bg-secondary/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Pensada también para el adulto mayor
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            La accesibilidad no es un extra: doña Carmen y personas como ella
            deben poder usar Seniory por sí mismas.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {caracteristicas.map(({ icono: Icono, titulo, descripcion }) => (
            <div
              key={titulo}
              className="flex flex-col items-center gap-3 rounded-2xl bg-card p-7 text-center ring-1 ring-border"
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
