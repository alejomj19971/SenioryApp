import type { Metadata } from "next";
import { CircleCheck, Info, PhoneCall, XCircle } from "lucide-react";

export const metadata: Metadata = { title: "Alcance de la teleasistencia" };

// La promesa exacta de la teleasistencia, en una sola página enlazada desde el pie y los términos (F10 §7, H7). No es
// un texto legal: es la misma honestidad que ya aplica dentro de la app (boton-alerta.tsx) — sin «línea de
// emergencia» ni «monitoreo activo» — puesta en un lugar que cualquiera puede leer antes de registrarse.
export default function AlcanceTeleasistenciaPage() {
  return (
    <article className="flex flex-col gap-6 text-base">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Alcance de la teleasistencia</h1>
        <p className="text-sm text-muted-foreground">Gratis para toda familia con un servicio contratado.</p>
      </div>

      <p role="note" className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/5 p-4 text-foreground">
        <PhoneCall className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <span>
          <strong>Si es una emergencia, llama directamente al 123.</strong> La teleasistencia de Seniory no reemplaza a los servicios de
          emergencia.
        </span>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Qué sí hace</h2>
        <ul className="flex flex-col gap-2">
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <span>Recuerda los medicamentos de la persona y deja registrado cuáles se tomaron.</span>
          </li>
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <span>Guarda los signos vitales que la familia o el cuidador registran, y avisa si una lectura sale fuera de lo esperado.</span>
          </li>
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <span>
              Un botón de alerta que, al presionarlo, avisa de verdad a las personas que la familia tiene vinculadas. La pantalla dice{" "}
              <strong>a quién se avisó</strong>, nunca un «se notificó» genérico.
            </span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Qué NO hace</h2>
        <ul className="flex flex-col gap-2">
          <li className="flex items-start gap-2">
            <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <span>No es una línea de emergencia: no hay nadie del otro lado monitoreando en vivo, ni un operador recibiendo la alerta.</span>
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <span>No es monitoreo médico continuo: no hay sensores ni personal clínico revisando los datos; los registra la familia o el cuidador.</span>
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <span>No interpreta lo que registra: si algo sale fuera de rango, lo dice y recomienda consultar con el médico de la persona, sin diagnosticar.</span>
          </li>
        </ul>
      </section>

      <p role="note" className="flex items-start gap-2 rounded-lg border border-info bg-info/5 p-4 text-foreground">
        <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
        <span>Nada de esto reemplaza una consulta médica ni la supervisión de un profesional de la salud.</span>
      </p>
    </article>
  );
}
