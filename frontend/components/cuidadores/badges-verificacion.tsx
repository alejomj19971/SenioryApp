import { ShieldCheck, GraduationCap, BrainCircuit, CheckCircle2 } from "lucide-react";
import type { Verificacion } from "@/lib/types";
import { formatearFecha } from "@/lib/format";

const items = [
  {
    clave: "antecedentes" as const,
    icono: ShieldCheck,
    titulo: "Antecedentes verificados",
  },
  {
    clave: "titulos" as const,
    icono: GraduationCap,
    titulo: "Títulos comprobados",
  },
  {
    clave: "psicotecnica" as const,
    icono: BrainCircuit,
    titulo: "Prueba psicotécnica aprobada",
  },
];

export function BadgesVerificacion({ verificacion }: { verificacion: Verificacion }) {
  return (
    <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-4">
      <ul className="flex flex-col gap-3">
        {items.map(({ clave, icono: Icono, titulo }) => (
          <li key={clave} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Icono className="size-5" aria-hidden="true" />
            </span>
            <span className="flex-1 text-base font-medium text-foreground">
              {titulo}
            </span>
            {verificacion[clave] && (
              <CheckCircle2
                className="size-5 shrink-0 text-primary"
                aria-label="Verificado"
              />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Verificado el {formatearFecha(verificacion.fechaVerificacion)}
      </p>
    </div>
  );
}
