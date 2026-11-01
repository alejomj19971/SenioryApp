"use client";

import { useActionState } from "react";
import { HeartPulse, ShieldCheck, Users } from "lucide-react";
import { MensajeDeCampo } from "@/components/cuenta/campo";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { otorgarConsentimiento } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

// El consentimiento para tratar datos de salud (Ley 1581): en frases cortas, qué datos, para qué, quién los ve.
// El texto es una versión de trabajo hasta que Legal lo apruebe (PENDIENTES, M1 decisión 1).
export function FormularioConsentimiento({ nombreDeLaPersona }: { nombreDeLaPersona: string }) {
  const [estado, accion, pendiente] = useActionState(otorgarConsentimiento, ESTADO_INICIAL);
  const error = estado.errores?.autorizo;

  return (
    <form action={accion} className="flex flex-col gap-6">
      <ResumenDelFormulario estado={estado} />
      <ul className="flex flex-col gap-4 text-base">
        <li className="flex gap-3">
          <HeartPulse className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>Qué datos:</strong> los medicamentos, los signos vitales (presión, pulso, glucosa) y las alertas de {nombreDeLaPersona}.
          </span>
        </li>
        <li className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>Para qué:</strong> avisarte a ti y a quien la cuide cuando algo necesite atención. Nada más.
          </span>
        </li>
        <li className="flex gap-3">
          <Users className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <strong>Quién los ve:</strong> tú, y el cuidador solo mientras tenga un servicio contigo. Cuando el servicio termina, deja de verlos al instante.
          </span>
        </li>
      </ul>
      <p className="text-base text-muted-foreground">Puedes retirar esta autorización cuando quieras.</p>

      <div className="flex flex-col gap-2">
        <label htmlFor="autorizo" className="flex min-h-12 items-start gap-3 text-base font-medium">
          <input
            id="autorizo"
            name="autorizo"
            type="checkbox"
            required
            aria-invalid={error !== undefined ? true : undefined}
            aria-describedby={error !== undefined ? "autorizo-error" : undefined}
            className="mt-0.5 size-6 shrink-0 accent-primary"
          />
          <span>Autorizo el tratamiento de los datos de salud de {nombreDeLaPersona}, como su representante.</span>
        </label>
        {error !== undefined && <MensajeDeCampo id="autorizo-error">{error}</MensajeDeCampo>}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Autorizo y continúo"}
      </Button>
    </form>
  );
}
