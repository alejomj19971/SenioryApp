import Link from "next/link";
import { ArrowLeft, Pill } from "lucide-react";
import { AgregarMedicamento } from "@/components/teleasistencia/formulario-medicamento";
import { DejarDeTomar } from "@/components/teleasistencia/dejar-de-tomar";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { listarMedicamentosDeHoy } from "@/lib/services/teleasistencia";

export const metadata = {
  title: "Medicamentos",
};

// Los medicamentos de la persona: agregar uno (con sus horas) o dejar de tomarlo. Solo la familia vinculada puede
// cambiar el plan; el cuidador marca las tomas (el backend lo verifica).
export default async function MedicamentosPage() {
  const { persona } = await exigirFamiliaLista();
  const { medicamentos } = await listarMedicamentosDeHoy();

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Link href="/app/teleasistencia" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Teleasistencia
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Medicamentos de {persona.nombre}</h1>
        <p className="text-base text-muted-foreground">Las horas aparecen cada día en la lista de tomas.</p>
      </div>

      {medicamentos.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {medicamentos.map((medicamento) => (
            <li key={medicamento.id} className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Pill className="size-5" aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <p className="text-base font-semibold text-foreground">
                    {medicamento.nombre} · {medicamento.dosis}
                  </p>
                  <p className="text-base text-muted-foreground">A las {medicamento.horarios.join(", ")}</p>
                  {medicamento.indicaciones !== "" && <p className="text-base text-muted-foreground">{medicamento.indicaciones}</p>}
                </div>
              </div>
              <DejarDeTomar medicamentoId={medicamento.id} nombre={medicamento.nombre} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-muted p-4 text-base text-muted-foreground">Todavía no hay medicamentos. Agrega el primero para recibir los avisos de cada toma.</p>
      )}

      <AgregarMedicamento />
    </div>
  );
}
