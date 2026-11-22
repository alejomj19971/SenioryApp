"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { MensajeDeCampo } from "@/components/cuenta/campo";
import { Button } from "@/components/ui/button";
import { NOMBRE_DEL_DIA } from "@/lib/acciones/validar-postulacion";
import { lunesDeLaSemana, sumarDias, type AhoraEnColombia } from "@/lib/fecha-colombia";
import { etiquetaHoraInicio, formatearDiaCivil } from "@/lib/format";
import type { RangoLibre } from "@/lib/types";

const PASO_DE_MINUTOS = 30;
const MINUTOS_POR_DIA = 1_440;
// Para «desde»: toda hora del día. Para «hasta»: lo mismo, más el cierre a medianoche (24:00).
const HORAS_DE_INICIO: number[] = Array.from({ length: MINUTOS_POR_DIA / PASO_DE_MINUTOS }, (_, i) => i * PASO_DE_MINUTOS);
const HORAS_DE_CIERRE: number[] = [...HORAS_DE_INICIO.slice(1), MINUTOS_POR_DIA];
const DIAS = [1, 2, 3, 4, 5, 6, 7];

function etiquetaDeCierre(minutos: number): string {
  return minutos === MINUTOS_POR_DIA ? "12:00 a. m. (fin del día)" : etiquetaHoraInicio(minutos);
}

const ordenar = (a: RangoLibre, b: RangoLibre) => a.diaSemana - b.diaSemana || a.horaInicio - b.horaInicio;

// El horario semanal del cuidador (reemplaza el antiguo checkbox de jornadas): por cada día, los rangos ya
// agregados (con botón de quitar) y un botón para agregar uno nuevo eligiendo «desde» y «hasta». El estado
// vive aquí y se sincroniza a un campo oculto en JSON, para que el resto del formulario (nativo, con
// `FormData`) no tenga que cambiar su forma de enviarse.
export function EditorDeHorario({
  nombreDelCampo,
  valorInicial,
  ahora,
  error,
}: {
  nombreDelCampo: string;
  valorInicial: RangoLibre[];
  ahora: AhoraEnColombia;
  error?: string;
}) {
  const [rangos, setRangos] = useState<RangoLibre[]>(valorInicial);
  const [diaParaAgregar, setDiaParaAgregar] = useState<number | null>(null);
  const [desde, setDesde] = useState(360);
  const [hasta, setHasta] = useState(1_080);
  const idDeError = useId();

  // La semana actual (lunes a domingo), solo como referencia concreta: el horario se repite cada semana.
  const lunes = lunesDeLaSemana(ahora.hoy);
  const fechaDelDia = (dia: number) => sumarDias(lunes, dia - 1);

  function empezarAAgregar(dia: number) {
    setDiaParaAgregar(dia);
    setDesde(360);
    setHasta(1_080);
  }

  function agregar() {
    if (diaParaAgregar === null || desde >= hasta) return;
    setRangos((actuales) => [...actuales, { diaSemana: diaParaAgregar, horaInicio: desde, horaFin: hasta }].sort(ordenar));
    setDiaParaAgregar(null);
  }

  function quitar(indice: number) {
    setRangos((actuales) => actuales.filter((_, i) => i !== indice));
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error !== undefined ? idDeError : undefined}>
      <legend className="text-base font-medium text-foreground">Tu horario semanal</legend>
      <p className="text-sm text-muted-foreground">
        Las horas en las que atiendes, día por día. Así queda tu semana a partir del {formatearDiaCivil(lunes)}, y se repite igual cada semana. Las familias solo
        pueden pedirte servicios dentro de estos rangos.
      </p>
      <input type="hidden" name={nombreDelCampo} value={JSON.stringify(rangos)} />
      <div className="flex flex-col gap-3">
        {DIAS.map((dia) => {
          const delDia = rangos.map((r, indice) => ({ ...r, indice })).filter((r) => r.diaSemana === dia);
          return (
            <div key={dia} className="flex flex-col gap-2 rounded-2xl bg-muted p-3">
              <span className="text-base font-medium text-foreground first-letter:uppercase">{formatearDiaCivil(fechaDelDia(dia))}</span>
              {delDia.length === 0 && diaParaAgregar !== dia && <p className="text-sm text-muted-foreground">No atiendes este día.</p>}
              {delDia.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {delDia.map((r) => (
                    <span key={r.indice} className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm text-foreground ring-1 ring-border">
                      {etiquetaHoraInicio(r.horaInicio)} – {etiquetaDeCierre(r.horaFin)}
                      <button type="button" onClick={() => quitar(r.indice)} aria-label={`Quitar ${etiquetaHoraInicio(r.horaInicio)} a ${etiquetaDeCierre(r.horaFin)} de ${NOMBRE_DEL_DIA[dia]?.toLowerCase()}`} className="text-muted-foreground hover:text-destructive">
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {diaParaAgregar === dia ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    Desde
                    <select
                      value={desde}
                      onChange={(e) => setDesde(Number(e.target.value))}
                      className="h-11 rounded-lg border border-input bg-card px-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {HORAS_DE_INICIO.map((m) => (
                        <option key={m} value={m}>
                          {etiquetaHoraInicio(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    Hasta
                    <select
                      value={hasta}
                      onChange={(e) => setHasta(Number(e.target.value))}
                      className="h-11 rounded-lg border border-input bg-card px-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {HORAS_DE_CIERRE.map((m) => (
                        <option key={m} value={m}>
                          {etiquetaDeCierre(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="button" size="sm" onClick={agregar} disabled={desde >= hasta}>
                    Agregar
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setDiaParaAgregar(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => empezarAAgregar(dia)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Agregar horario
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {error !== undefined && <MensajeDeCampo id={idDeError}>{error}</MensajeDeCampo>}
    </fieldset>
  );
}
