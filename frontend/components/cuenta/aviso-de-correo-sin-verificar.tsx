"use client";

import { useState, useTransition } from "react";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reenviarVerificacionDeCorreo } from "@/lib/acciones/cuenta";

// El aviso que ve quien todavía no confirmó su correo: le explica por qué importa y le deja pedir otro enlace. Sin confirmar no
// llegan avisos por correo (la campana de la aplicación sigue funcionando).
export function AvisoDeCorreoSinVerificar({ correo }: { correo: string }) {
  const [pendiente, empezar] = useTransition();
  const [respuesta, setRespuesta] = useState<{ ok: boolean; mensaje: string } | null>(null);

  function reenviar() {
    empezar(async () => {
      setRespuesta(await reenviarVerificacionDeCorreo());
    });
  }

  return (
    <section aria-labelledby="correo-sin-verificar" className="flex flex-col gap-2 border-b border-warning/40 bg-warning/15 px-4 py-3">
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="correo-sin-verificar" className="text-base font-semibold text-foreground">
            Confirma tu correo
          </h2>
          <p className="text-sm text-foreground">
            Te enviamos un enlace a <span className="font-medium break-all">{correo}</span>. Sin confirmarlo no podemos avisarte por correo.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-8">
        <Button type="button" variant="outline" size="sm" onClick={reenviar} disabled={pendiente}>
          {pendiente ? "Enviando…" : "Reenviar el enlace"}
        </Button>
      </div>
      {respuesta !== null && (
        <p role={respuesta.ok ? "status" : "alert"} className="pl-8 text-sm text-foreground">
          {respuesta.mensaje}
        </p>
      )}
    </section>
  );
}
