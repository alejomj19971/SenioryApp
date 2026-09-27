import Link from "next/link";
import { Search, HeartPulse, Pill, Activity, ChevronRight } from "lucide-react";
import { obtenerAdultoMayor, obtenerFamiliar } from "@/lib/services/paciente";
import {
  obtenerProximoMedicamento,
  obtenerUltimaLecturaSignos,
} from "@/lib/services/teleasistencia";

export default async function InicioPage() {
  const [familiar, adultoMayor, ultimaLectura, proximoMedicamento] =
    await Promise.all([
      obtenerFamiliar(),
      obtenerAdultoMayor(),
      obtenerUltimaLecturaSignos(),
      obtenerProximoMedicamento(),
    ]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Hola, {familiar.nombre}
        </h1>
        <p className="text-base text-muted-foreground">
          Esto es lo que pasa hoy con {adultoMayor.nombre}.
        </p>
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
            <p className="text-sm font-medium text-primary">Monitoreo activo</p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3">
            <Activity className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Último signo</p>
              <p className="text-sm font-semibold text-foreground">
                {ultimaLectura
                  ? `${ultimaLectura.presionSistolica}/${ultimaLectura.presionDiastolica} mmHg`
                  : "Sin datos"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3">
            <Pill className="size-5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Próximo medicamento</p>
              <p className="text-sm font-semibold text-foreground">
                {proximoMedicamento
                  ? `${proximoMedicamento.nombre} · ${proximoMedicamento.hora}`
                  : "Al día"}
              </p>
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
          className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-accent p-6 text-center text-accent-foreground"
        >
          <HeartPulse className="size-8" aria-hidden="true" />
          <span className="text-base font-semibold">Teleasistencia</span>
        </Link>
      </div>
    </div>
  );
}
