import { ShieldCheck, GraduationCap, BrainCircuit, CheckCircle2 } from "lucide-react";

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
    <section className="bg-secondary/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Confianza verificable, no de boca a boca
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Cada cuidador del directorio pasa por tres filtros antes de aparecer
            en Seniory — los mismos que verás en cada perfil.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl rounded-2xl border-2 border-primary/25 bg-primary/5 p-6 sm:p-8">
          <ul className="flex flex-col divide-y divide-primary/15">
            {filtros.map(({ icono: Icono, titulo, descripcion }) => (
              <li key={titulo} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Icono className="size-6" aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-foreground sm:text-lg">{titulo}</h3>
                  <p className="text-sm text-muted-foreground sm:text-base">{descripcion}</p>
                </div>
                <CheckCircle2 className="size-6 shrink-0 text-primary" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
