"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { CampoDeContrasena } from "@/components/cuenta/campo-de-contrasena";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { cambiarContrasena } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { LARGO_MINIMO_DE_CONTRASENA } from "@/lib/acciones/validar-cuenta";

export function FormularioCambiarContrasena() {
  const [estado, accion, pendiente] = useActionState(cambiarContrasena, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.listo === true && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-success bg-success/5 p-4 text-base text-foreground">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          Listo, cambiaste tu contraseña. Cerramos tus otras sesiones por seguridad.
        </p>
      )}
      <ResumenDelFormulario estado={estado} />
      <CampoDeContrasena
        nombre="contrasenaActual"
        etiqueta="Contraseña actual"
        autoComplete="current-password"
        required
        error={estado.errores?.contrasenaActual}
      />
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
        {pendiente ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
