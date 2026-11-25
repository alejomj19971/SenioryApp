"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { reactivarCuidadorAccion, suspenderCuidadorAccion } from "@/lib/acciones/postulacion";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

interface VisibilidadDelCuidadorProps {
  cuidadorId: string;
  nombre: string;
  // Solo un cuidador activo se puede suspender y solo uno suspendido se puede reactivar: en los demás estados no hay nada que ofrecer.
  estado: "borrador" | "en_revision" | "activo" | "suspendido";
}

// Retirar a un cuidador del directorio, o devolverlo. Suspender es una decisión grande (cancela servicios y devuelve dinero),
// así que pide confirmación y dice exactamente qué va a pasar antes de hacerlo.
export function VisibilidadDelCuidador({ cuidadorId, nombre, estado }: VisibilidadDelCuidadorProps) {
  const [confirmando, setConfirmando] = useState(false);
  const [suspension, suspender, suspendiendo] = useActionState(suspenderCuidadorAccion.bind(null, cuidadorId), ESTADO_INICIAL);
  const [reactivacion, reactivar, reactivando] = useActionState(reactivarCuidadorAccion.bind(null, cuidadorId), ESTADO_INICIAL);

  if (estado !== "activo" && estado !== "suspendido") return null;

  return (
    <section aria-labelledby="visibilidad" className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border">
      <h2 id="visibilidad" className="text-lg font-semibold text-foreground">
        Visibilidad en Seniory
      </h2>

      {estado === "suspendido" ? (
        <>
          <p className="text-base text-muted-foreground">
            {nombre} está suspendido: no aparece en las búsquedas ni se le pueden pedir servicios. Al reactivarlo vuelve a mostrarse si tiene sus tres verificaciones vigentes. Los
            servicios que se cancelaron al suspenderlo no se restablecen.
          </p>
          {reactivacion.mensaje !== undefined && <Aviso titulo={reactivacion.mensaje} />}
          <form action={reactivar}>
            <Button type="submit" disabled={reactivando}>
              <Eye aria-hidden="true" />
              {reactivando ? "Reactivando…" : "Reactivar cuidador"}
            </Button>
          </form>
        </>
      ) : confirmando ? (
        <form action={suspender} className="flex flex-col gap-3" aria-label={`Confirmar la suspensión de ${nombre}`}>
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-muted p-4 text-base text-foreground">
            <p className="font-semibold">¿Suspender a {nombre}?</p>
            <ul className="list-disc pl-5 text-sm">
              <li>Deja de aparecer en las búsquedas de inmediato.</li>
              <li>Se cancelan sus servicios solicitados y aceptados, y se le devuelve todo el dinero a cada familia.</li>
              <li>Los servicios que ya están en curso no se interrumpen.</li>
              <li>Podrás reactivarlo después, pero los servicios cancelados no se restablecen.</li>
            </ul>
          </div>
          {suspension.mensaje !== undefined && <Aviso titulo={suspension.mensaje} />}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" disabled={suspendiendo}>
              <EyeOff aria-hidden="true" />
              {suspendiendo ? "Suspendiendo…" : "Sí, suspender"}
            </Button>
            <Button type="button" variant="outline" disabled={suspendiendo} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-base text-muted-foreground">Si hace falta, puedes retirar a este cuidador del directorio. Verás qué pasa con sus servicios antes de confirmar.</p>
          <div>
            <Button type="button" variant="outline" onClick={() => setConfirmando(true)}>
              <EyeOff aria-hidden="true" />
              Suspender cuidador
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
