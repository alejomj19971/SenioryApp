import { Suspense } from "react";
import { HeartPulse, TriangleAlert } from "lucide-react";
import { BotonAlerta } from "@/components/teleasistencia/boton-alerta";
import { CuidadorEnTurno } from "@/components/teleasistencia/cuidador-en-turno";
import { GraficaSignos } from "@/components/teleasistencia/grafica-signos";
import { RegistrarLectura } from "@/components/teleasistencia/formulario-lectura";
import { ListaMedicamentos } from "@/components/teleasistencia/lista-medicamentos";
import { RefrescoPeriodico } from "@/components/teleasistencia/refresco-periodico";
import { formatearFechaHora } from "@/lib/format";
import { obtenerAdultoMayor, obtenerCuidadorEnTurno } from "@/lib/services/paciente";
import { listarLecturas, listarMedicamentosDeHoy, obtenerResumen } from "@/lib/services/teleasistencia";

export const metadata = {
  title: "Teleasistencia",
};

export default async function TeleasistenciaPage() {
  const [adultoMayor, cuidadorEnTurno, medicamentos, lecturas, resumen] = await Promise.all([
    obtenerAdultoMayor(),
    obtenerCuidadorEnTurno(),
    listarMedicamentosDeHoy(),
    listarLecturas(),
    obtenerResumen(),
  ]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      {/* La pantalla se pone al día sola mientras se mira: el backend aún no tiene flujo en vivo. */}
      <RefrescoPeriodico />

      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-foreground">
            {adultoMayor.nombre}, {adultoMayor.edad} años
          </h1>
          <span className="inline-flex shrink-0 items-center rounded-full bg-success px-3 py-1 text-sm font-semibold text-success-foreground">Gratis</span>
        </div>
        {resumen.ultimaLectura !== null && (
          <p className="mt-1 text-base text-muted-foreground">Última lectura: {formatearFechaHora(resumen.ultimaLectura.fecha)}</p>
        )}
      </div>

      {resumen.alertasSinAtender > 0 && (
        <p role="note" className="flex items-start gap-2 rounded-2xl border border-destructive bg-destructive/5 p-4 text-base text-foreground">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            Hay {resumen.alertasSinAtender === 1 ? "una alerta de ayuda" : `${resumen.alertasSinAtender} alertas de ayuda`} sin atender. Comunícate con {adultoMayor.nombre} o con quien la cuida.
          </span>
        </p>
      )}

      {cuidadorEnTurno && <CuidadorEnTurno cuidador={cuidadorEnTurno} adultoMayorNombre={adultoMayor.nombre} />}

      <Suspense fallback={<div className="min-h-24 w-full animate-pulse rounded-2xl bg-muted" />}>
        <BotonAlerta nombreDeLaPersona={adultoMayor.nombre} />
      </Suspense>

      <div className="h-px bg-border" aria-hidden="true" />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Medicamentos de hoy</h2>
        <ListaMedicamentos tomas={medicamentos.tomas} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <HeartPulse className="size-5 text-primary" aria-hidden="true" />
          Signos vitales
        </h2>
        <GraficaSignos lecturas={lecturas} />
        <RegistrarLectura />
      </section>
    </div>
  );
}
