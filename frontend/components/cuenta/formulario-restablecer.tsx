"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CampoDeContrasena } from "@/components/cuenta/campo-de-contrasena";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { restablecerContrasena } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { LARGO_MINIMO_DE_CONTRASENA } from "@/lib/acciones/validar-cuenta";

export function FormularioRestablecer({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(restablecerContrasena, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-5">
      <ResumenDelFormulario estado={estado} />
      <input type="hidden" name="token" value={token} />
      <CampoDeContrasena
        nombre="contrasena"
        etiqueta="Contraseña nueva"
        autoComplete="new-password"
        required
        minLength={LARGO_MINIMO_DE_CONTRASENA}
        ayuda={`Mínimo ${LARGO_MINIMO_DE_CONTRASENA} caracteres.`}
        error={estado.errores?.contrasena}
      />
      <CampoDeContrasena
        nombre="confirmacion"
        etiqueta="Repite la contraseña nueva"
        autoComplete="new-password"
        required
        error={estado.errores?.confirmacion}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar contraseña"}
      </Button>
      <Link
        href="/recuperar"
        className="inline-flex min-h-12 items-center justify-center font-medium text-primary underline underline-offset-4"
      >
        Pedir un enlace nuevo
      </Link>
    </form>
  );
}
