"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { Campo } from "@/components/cuenta/campo";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { solicitarRecuperacion } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

export function FormularioRecuperar() {
  const [estado, accion, pendiente] = useActionState(solicitarRecuperacion, ESTADO_INICIAL);

  // Responde igual exista o no la cuenta: la pantalla no revela qué correos tienen cuenta.
  if (estado.listo === true) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        <MailCheck className="size-10 text-success" aria-hidden="true" />
        <p className="text-lg font-semibold text-foreground">Revisa tu correo</p>
        <p className="text-base text-muted-foreground">
          Si hay una cuenta con ese correo, te enviamos un enlace para elegir una contraseña nueva. Vence en 30 minutos.
        </p>
        <Link
          href="/ingresar"
          className="inline-flex min-h-12 items-center font-medium text-primary underline underline-offset-4"
        >
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-5">
      <ResumenDelFormulario estado={estado} />
      <Campo
        nombre="correo"
        etiqueta="Correo de tu cuenta"
        type="email"
        icono={Mail}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        required
        defaultValue={estado.valores?.correo}
        error={estado.errores?.correo}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Enviando…" : "Enviar el enlace"}
      </Button>
      <Link
        href="/ingresar"
        className="inline-flex min-h-12 items-center justify-center font-medium text-primary underline underline-offset-4"
      >
        Volver a ingresar
      </Link>
    </form>
  );
}
