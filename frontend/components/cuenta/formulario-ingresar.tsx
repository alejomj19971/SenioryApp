"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleCheck, Mail } from "lucide-react";
import { Campo } from "@/components/cuenta/campo";
import { CampoDeContrasena } from "@/components/cuenta/campo-de-contrasena";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { iniciarSesion } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

export function FormularioIngresar({ volver, contrasenaRestablecida }: { volver?: string; contrasenaRestablecida: boolean }) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-5">
      {contrasenaRestablecida && (
        <p className="flex items-start gap-2 rounded-lg border border-success bg-success/5 p-4 text-base text-foreground">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          Cambiaste tu contraseña. Ingresa con la nueva.
        </p>
      )}
      <ResumenDelFormulario estado={estado} />
      {volver !== undefined && <input type="hidden" name="volver" value={volver} />}
      <Campo
        nombre="correo"
        etiqueta="Correo"
        type="email"
        icono={Mail}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        required
        defaultValue={estado.valores?.correo}
        error={estado.errores?.correo}
      />
      <CampoDeContrasena
        nombre="contrasena"
        etiqueta="Contraseña"
        autoComplete="current-password"
        required
        error={estado.errores?.contrasena}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Ingresando…" : "Ingresar"}
      </Button>
      <div className="flex flex-col items-center gap-1 text-base">
        <Link href="/recuperar" className="inline-flex min-h-12 items-center font-medium text-primary underline underline-offset-4">
          Olvidé mi contraseña
        </Link>
        <p className="text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="inline-flex min-h-12 items-center font-medium text-primary underline underline-offset-4">
            Crear cuenta
          </Link>
        </p>
      </div>
    </form>
  );
}
