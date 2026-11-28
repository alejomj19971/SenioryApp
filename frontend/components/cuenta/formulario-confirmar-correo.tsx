"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { confirmarCorreo } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

// El paso final de «verificar mi correo»: un botón, no un enlace que actúa solo. Así un antivirus que abre los enlaces del correo
// no confirma (ni gasta) el enlace en lugar de la persona.
export function FormularioConfirmarCorreo({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(confirmarCorreo, ESTADO_INICIAL);

  if (estado.listo === true) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        <MailCheck className="size-10 text-success" aria-hidden="true" />
        <p className="text-lg font-semibold text-foreground">Tu correo quedó confirmado</p>
        <p className="text-base text-muted-foreground">Desde ahora te avisaremos de lo importante también por correo.</p>
        <Link href="/app" className="inline-flex min-h-12 items-center font-medium text-primary underline underline-offset-4">
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-5">
      <ResumenDelFormulario estado={estado} />
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Confirmando…" : "Confirmar mi correo"}
      </Button>
      {estado.mensaje !== undefined && (
        <Link href="/app" className="inline-flex min-h-12 items-center justify-center font-medium text-primary underline underline-offset-4">
          Ir a mi cuenta para pedir un enlace nuevo
        </Link>
      )}
    </form>
  );
}
