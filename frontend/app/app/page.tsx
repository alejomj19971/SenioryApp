import Link from "next/link";
import { Search, HeartPulse, Pill, Activity, ChevronRight } from "lucide-react";
import { obtenerAdultoMayor, obtenerFamiliar } from "@/lib/services/paciente";
import { obtenerResumen, obtenerUltimaLectura } from "@/lib/services/teleasistencia";
import type { LecturaSignos, ResumenDeTeleasistencia } from "@/lib/types";

// La medida más reciente que se tomó, dicha corto: la presión si la hay; si no, el pulso o la glucosa.
function resumenDeLectura(lectura: LecturaSignos | null): string {
  if (lectura === null) return "Sin datos";
  if (lectura.presionSistolica !== null && lectura.presionDiastolica !== null) return `${lectura.presionSistolica}/${lectura.presionDiastolica} mmHg`;
  if (lectura.frecuenciaCardiaca !== null) return `${lectura.frecuenciaCardiaca} lpm`;
  if (lectura.glucosa !== null) return `${lectura.glucosa} mg/dL`;
  return "Sin datos";
}

function resumenDeMedicamentos(resumen: ResumenDeTeleasistencia): string {
  if (resumen.tomas.total === 0) return "Sin medicamentos";
  if (resumen.proximaToma !== null) return `${resumen.proximaToma.nombre} · ${resumen.proximaToma.hora}`;
  return "Al día";
}

export default async function InicioPage() {
  const [familiar, adultoMayor, ultimaLectura, resumen] = await Promise.all([
    obtenerFamiliar(),
    obtenerAdultoMayor(),
    obtenerUltimaLectura(),
    obtenerResumen(),
  ]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hola, {familiar.nombre}</h1>
        <p className="text-base text-muted-foreground">Esto es lo que pasa hoy con {adultoMayor.nombre}.</p>
      </div>

      <Link
        href="/app/teleasistencia"
        className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border transition-colors hover:ring-primary/40"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-foreground">
              {adultoMayor.nombre}, {adultoMayor.edad} años
            </p>
            {resumen.alertasSinAtender > 0 && (
              <p className="text-base font-medium text-destructive">
                {resumen.alertasSinAtender === 1 ? "Una alerta sin atender" : `${resumen.alertasSinAtender} alertas sin atender`}
              </p>
            )}
          </div>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3">
            <Activity className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm text-muted-foreground">Último signo</p>
              <p className="text-base font-semibold text-foreground">{resumenDeLectura(ultimaLectura)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3">
            <Pill className="size-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="text-sm text-muted-foreground">Próximo medicamento</p>
              <p className="text-base font-semibold text-foreground">{resumenDeMedicamentos(resumen)}</p>
            </div>
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/app/cuidadores"
          className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-primary p-6 text-center text-primary-foreground"
        >
          <Search className="size-8" aria-hidden="true" />
          <span className="text-base font-semibold">Buscar cuidador</span>
        </Link>
        <Link
          href="/app/teleasistencia"
          className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-success p-6 text-center text-success-foreground"
        >
          <HeartPulse className="size-8" aria-hidden="true" />
          <span className="text-base font-semibold">Teleasistencia</span>
        </Link>
      </div>
    </div>
  );
}
