"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HeartPulse, Droplet, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LecturaSignos } from "@/lib/types";

const formateadorDia = new Intl.DateTimeFormat("es-CO", { weekday: "short" });

function etiquetaDia(fechaISO: string): string {
  return formateadorDia.format(new Date(fechaISO)).replace(".", "");
}

export function GraficaSignos({ lecturas }: { lecturas: LecturaSignos[] }) {
  const ultima = lecturas[lecturas.length - 1];
  const datos = lecturas.map((lectura) => ({
    dia: etiquetaDia(lectura.fecha),
    sistolica: lectura.presionSistolica,
    diastolica: lectura.presionDiastolica,
    frecuenciaCardiaca: lectura.frecuenciaCardiaca,
    glucosa: lectura.glucosa,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted p-3 text-center">
          <Activity className="mx-auto size-5 text-primary" aria-hidden="true" />
          <p className="mt-1 text-sm font-bold text-foreground">
            {ultima.presionSistolica}/{ultima.presionDiastolica}
          </p>
          <p className="text-xs text-muted-foreground">Presión</p>
        </div>
        <div className="rounded-xl bg-muted p-3 text-center">
          <HeartPulse className="mx-auto size-5 text-destructive" aria-hidden="true" />
          <p className="mt-1 text-sm font-bold text-foreground">
            {ultima.frecuenciaCardiaca} lpm
          </p>
          <p className="text-xs text-muted-foreground">Frecuencia</p>
        </div>
        <div className="rounded-xl bg-muted p-3 text-center">
          <Droplet className="mx-auto size-5 text-accent" aria-hidden="true" />
          <p className="mt-1 text-sm font-bold text-foreground">{ultima.glucosa} mg/dL</p>
          <p className="text-xs text-muted-foreground">Glucosa</p>
        </div>
      </div>

      <Tabs defaultValue="presion">
        <TabsList className="w-full">
          <TabsTrigger value="presion">Presión</TabsTrigger>
          <TabsTrigger value="frecuencia">Frecuencia</TabsTrigger>
          <TabsTrigger value="glucosa">Glucosa</TabsTrigger>
        </TabsList>

        <TabsContent value="presion" className="h-56 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="dia" fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis fontSize={12} stroke="var(--muted-foreground)" domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 12,
                  fontSize: 13,
                }}
              />
              <Line type="monotone" dataKey="sistolica" name="Sistólica" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="diastolica" name="Diastólica" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="frecuencia" className="h-56 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="dia" fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis fontSize={12} stroke="var(--muted-foreground)" domain={["dataMin - 5", "dataMax + 5"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 12,
                  fontSize: 13,
                }}
              />
              <Line type="monotone" dataKey="frecuenciaCardiaca" name="Frecuencia cardiaca" stroke="var(--destructive)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="glucosa" className="h-56 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="dia" fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis fontSize={12} stroke="var(--muted-foreground)" domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 12,
                  fontSize: 13,
                }}
              />
              <Line type="monotone" dataKey="glucosa" name="Glucosa" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>
      </Tabs>
    </div>
  );
}
