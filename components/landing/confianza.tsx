import { ShieldCheck, GraduationCap, BrainCircuit } from "lucide-react";

const filtros = [
  {
    icono: ShieldCheck,
    titulo: "Antecedentes verificados",
    descripcion: "Policía, Procuraduría y Contraloría, revisados antes de publicar el perfil.",
  },
  {
    icono: GraduationCap,
    titulo: "Títulos comprobados",
    descripcion: "Validamos cada certificación y título técnico o profesional.",
  },
  {
    icono: BrainCircuit,
    titulo: "Prueba psicotécnica",
    descripcion: "Evaluación aprobada que confirma la idoneidad para el cuidado de personas mayores.",
  },
];

export function Confianza() {
  return (
    <section className="bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Confianza verificable, no de boca a boca
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Cada cuidador del directorio pasa por tres filtros antes de aparecer
            en Seniory.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {filtros.map(({ icono: Icono, titulo, descripcion }) => (
            <div
              key={titulo}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-primary/20 bg-primary/5 p-7 text-center"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
