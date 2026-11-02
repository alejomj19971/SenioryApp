"use client";

import { useActionState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { renovarControlAccion, solicitarRevisionAccion } from "@/lib/acciones/postulacion";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import type { ControlDeVerificacion } from "@/lib/types";

// «Enviar a revisión»: pasa los tres controles a pendientes para que un revisor los mire. Hay que haber subido la
// cédula, los antecedentes, el título y la psicotécnica; si falta algo, el backend lo dice y aquí se muestra.
export function BotonDeRevision() {
  const [estado, accion, pendiente] = useActionState(solicitarRevisionAccion, ESTADO_INICIAL);
  return (
    <form action={accion} className="flex flex-col gap-3">
      {estado.mensaje !== undefined && <Aviso titulo="No pudimos enviarlo a revisión" descripcion={estado.mensaje} />}
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        <Send aria-hidden="true" />
        {pendiente ? "Enviando…" : "Enviar mi perfil a revisión"}
      </Button>
    </form>
  );
}

// Un control vencido o rechazado se vuelve a pedir después de subir un documento nuevo.
export function BotonDeRenovacion({ control, nombre }: { control: ControlDeVerificacion; nombre: string }) {
  const [estado, accion, pendiente] = useActionState(renovarControlAccion.bind(null, control), ESTADO_INICIAL);
  return (
    <form action={accion} className="flex flex-col gap-2">
      {estado.mensaje !== undefined && <Aviso titulo="No pudimos pedir la renovación" descripcion={estado.mensaje} />}
      <Button type="submit" variant="outline" disabled={pendiente}>
        <RefreshCw aria-hidden="true" />
        {pendiente ? "Enviando…" : `Pedir revisión de ${nombre}`}
      </Button>
    </form>
  );
}
