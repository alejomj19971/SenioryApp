"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Droplet, HeartPulse, TriangleAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LecturaSignos } from "@/lib/types";

const formateadorDia = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const etiquetaDia = (fechaISO: string) => formateadorDia.format(new Date(fechaISO)).replace(".", "");

const ESTILO_DEL_CUADRO = { backgroundColor: "var(--popover)", borderColor: "var(--border)", borderRadius: 12, fontSize: 14 };

// La última medida que SÍ se tomó de cada tipo (una lectura puede traer solo la glucosa, por ejemplo).
function ultimaCon<T>(lecturas: LecturaSignos[], valor: (lectura: LecturaSignos) => T | null): { lectura: LecturaSignos; valor: T } | null {
  for (let i = lecturas.length - 1; i >= 0; i--) {
    const lectura = lecturas[i] as LecturaSignos;
    const v = valor(lectura);
    if (v !== null) return { lectura, valor: v };
  }
  return null;
}

// Los signos vitales de los últimos días (F6). Cada medida es opcional: una lectura puede traer solo una. Sin lecturas,
// se dice (no es un error). «Fuera de rango» lo decide el backend y no dice cuál medida ni cuánto: aquí solo se avisa
// que conviene consultar a un médico; la pantalla no interpreta nada clínico.
export function GraficaSignos({ lecturas }: { lecturas: LecturaSignos[] }) {
  if (lecturas.length === 0) {
    return <p className="rounded-2xl bg-muted p-4 text-base text-muted-foreground">Todavía no hay lecturas. Registra la primera para ver cómo evoluciona.</p>;
  }

  const presion = ultimaCon(lecturas, (l) => (l.presionSistolica !== null && l.presionDiastolica !== null ? `${l.presionSistolica}/${l.presionDiastolica}` : null));
  const pulso = ultimaCon(lecturas, (l) => l.frecuenciaCardiaca);
  const glucosa = ultimaCon(lecturas, (l) => l.glucosa);
  const ultima = lecturas[lecturas.length - 1] as LecturaSignos;
  const datos = lecturas.map((l) => ({
    dia: etiquetaDia(l.fecha),
    sistolica: l.presionSistolica,
    diastolica: l.presionDiastolica,
    frecuenciaCardiaca: l.frecuenciaCardiaca,
    glucosa: l.glucosa,
  }));

  return (
    <div className="flex flex-col gap-4">
      {ultima.fueraDeRango && (
        <p role="note" className="flex items-start gap-2 rounded-2xl border border-warning bg-warning/10 p-3 text-base text-foreground">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>La última lectura quedó fuera del rango esperado. Consulta con su médico si te preocupa.</span>
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted p-3 text-center">
          <Activity className="mx-auto size-5 text-primary" aria-hidden="true" />
          <p className="mt-1 text-base font-bold text-foreground">{presion?.valor ?? "—"}</p>
          <p className="text-sm text-muted-foreground">Presión</p>
        </div>
        <div className="rounded-xl bg-muted p-3 text-center">
          <HeartPulse className="mx-auto size-5 text-primary" aria-hidden="true" />
          <p className="mt-1 text-base font-bold text-foreground">{pulso === null ? "—" : `${pulso.valor} lpm`}</p>
          <p className="text-sm text-muted-foreground">Pulso</p>
        </div>
        <div className="rounded-xl bg-muted p-3 text-center">
          <Droplet className="mx-auto size-5 text-primary" aria-hidden="true" />
          <p className="mt-1 text-base font-bold text-foreground">{glucosa === null ? "—" : `${glucosa.valor} mg/dL`}</p>
          <p className="text-sm text-muted-foreground">Glucosa</p>
        </div>
      </div>

      <Tabs defaultValue="presion">
        <TabsList className="w-full">
          <TabsTrigger value="presion">Presión</TabsTrigger>
          <TabsTrigger value="frecuencia">Pulso</TabsTrigger>
          <TabsTrigger value="glucosa">Glucosa</TabsTrigger>
        </TabsList>

        <TabsContent value="presion" className="h-56 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="dia" fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis fontSize={12} stroke="var(--muted-foreground)" domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip contentStyle={ESTILO_DEL_CUADRO} />
              <Line type="monotone" dataKey="sistolica" name="Alta" stroke="var(--chart-1)" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="diastolica" name="Baja" stroke="var(--chart-2)" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="frecuencia" className="h-56 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="dia" fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis fontSize={12} stroke="var(--muted-foreground)" domain={["dataMin - 5", "dataMax + 5"]} />
              <Tooltip contentStyle={ESTILO_DEL_CUADRO} />
              <Line type="monotone" dataKey="frecuenciaCardiaca" name="Pulso" stroke="var(--chart-1)" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="glucosa" className="h-56 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="dia" fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis fontSize={12} stroke="var(--muted-foreground)" domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip contentStyle={ESTILO_DEL_CUADRO} />
              <Line type="monotone" dataKey="glucosa" name="Glucosa" stroke="var(--chart-2)" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>
      </Tabs>
    </div>
  );
}
