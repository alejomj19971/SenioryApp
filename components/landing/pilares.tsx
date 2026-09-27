import { BadgeCheck, HeartPulse, Footprints } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const pilares = [
  {
    icono: BadgeCheck,
    titulo: "Directorio de talento certificado",
    descripcion:
      "Contrata por horas o turnos a auxiliares, enfermeros y terapeutas con antecedentes, títulos y prueba psicotécnica verificados.",
    etiqueta: null,
  },
  {
    icono: HeartPulse,
    titulo: "Teleasistencia y monitoreo",
    descripcion:
      "Botón de alerta remota, recordatorios de medicamentos y signos vitales visibles para la familia en tiempo real.",
    etiqueta: "Gratis",
  },
  {
    icono: Footprints,
    titulo: "Acompañamiento presencial",
    descripcion:
      "Salidas a citas médicas, diligencias, compras y estimulación cognitiva con compañía de confianza.",
    etiqueta: null,
  },
];

export function Pilares() {
  return (
    <section id="servicios" className="bg-secondary/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Tres pilares, un mismo cuidado
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {pilares.map(({ icono: Icono, titulo, descripcion, etiqueta }) => (
            <div
              key={titulo}
              className="flex flex-col gap-4 rounded-2xl bg-card p-7 shadow-sm ring-1 ring-border"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icono className="size-6" aria-hidden="true" />
                </span>
                {etiqueta && (
                  <Badge className="bg-accent text-accent-foreground">
                    {etiqueta}
                  </Badge>
                )}
              </div>
              <h3 className="text-xl font-semibold text-foreground">{titulo}</h3>
              <p className="text-base text-muted-foreground">{descripcion}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
