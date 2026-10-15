import { Suspense } from "react";
import { HeartPulse } from "lucide-react";
import { BotonAlerta } from "@/components/teleasistencia/boton-alerta";
import { CuidadorEnTurno } from "@/components/teleasistencia/cuidador-en-turno";
import { ListaMedicamentos } from "@/components/teleasistencia/lista-medicamentos";
import { GraficaSignos } from "@/components/teleasistencia/grafica-signos";
import { obtenerAdultoMayor, obtenerCuidadorEnTurno } from "@/lib/services/paciente";
import {
  listarMedicamentos,
  listarSignosVitales,
  obtenerUltimaLecturaSignos,
} from "@/lib/services/teleasistencia";
import { formatearMinutosDesde } from "@/lib/format";

export const metadata = {
  title: "Teleasistencia",
};

export default async function TeleasistenciaPage() {
  const [adultoMayor, cuidadorEnTurno, medicamentos, signosVitales, ultimaLectura] = await Promise.all([
    obtenerAdultoMayor(),
    obtenerCuidadorEnTurno(),
    listarMedicamentos(),
    listarSignosVitales(),
    obtenerUltimaLecturaSignos(),
  ]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            {adultoMayor.nombre}, {adultoMayor.edad} años
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            Gratis
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-primary">
          <span className="flex size-2 rounded-full bg-primary" aria-hidden="true" />
          Monitoreo activo
        </div>
        {ultimaLectura && (
          <p className="mt-1 text-xs text-muted-foreground">
            Actualizado {formatearMinutosDesde(ultimaLectura.fecha)}
          </p>
        )}
      </div>

      {cuidadorEnTurno && (
        <CuidadorEnTurno cuidador={cuidadorEnTurno} adultoMayorNombre={adultoMayor.nombre} />
      )}

      <Suspense fallback={<div className="min-h-24 w-full animate-pulse rounded-2xl bg-destructive/40" />}>
        <BotonAlerta />
      </Suspense>

      <div className="h-px bg-border" aria-hidden="true" />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Medicamentos de hoy</h2>
        <ListaMedicamentos medicamentos={medicamentos} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <HeartPulse className="size-5 text-primary" aria-hidden="true" />
          Signos vitales
        </h2>
        <GraficaSignos lecturas={signosVitales} />
      </section>
    </div>
  );
}
