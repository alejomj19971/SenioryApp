import { MessageCircleWarning, Ban, HelpCircle } from "lucide-react";

const puntos = [
  {
    icono: MessageCircleWarning,
    titulo: "Grupos de WhatsApp",
    descripcion:
      "Referencias que pasan de mano en mano, sin forma real de comprobarlas.",
  },
  {
    icono: Ban,
    titulo: "Sin garantías",
    descripcion:
      "No hay antecedentes verificados, ni títulos comprobados, ni respaldo si algo sale mal.",
  },
  {
    icono: HelpCircle,
    titulo: "Cero visibilidad",
    descripcion:
      "La familia se entera de un problema horas después, cuando ya es tarde para actuar.",
  },
];

export function Problema() {
  return (
    <section className="bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            El cuidado de nuestros mayores hoy es informal
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Miles de familias colombianas confían el cuidado de sus padres a la
            suerte, no a la verificación.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {puntos.map(({ icono: Icono, titulo, descripcion }) => (
            <div
              key={titulo}
              className="rounded-2xl border border-border bg-card p-6 text-left"
            >
              <Icono className="size-8 text-accent" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {titulo}
              </h3>
              <p className="mt-2 text-base text-muted-foreground">
                {descripcion}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-3xl bg-primary px-6 py-10 text-center text-primary-foreground sm:px-12">
          <p className="text-5xl font-extrabold tracking-tight sm:text-6xl">2036</p>
          <p className="mx-auto mt-3 max-w-xl text-lg text-primary-foreground/90">
            Según el DANE, para ese año Colombia tendrá más personas mayores de
            60 años que menores de 15.
          </p>
        </div>
      </div>
    </section>
  );
}
