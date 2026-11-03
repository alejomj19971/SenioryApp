"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail, Phone, User } from "lucide-react";
import { Campo, MensajeDeCampo } from "@/components/cuenta/campo";
import { CampoDeContrasena } from "@/components/cuenta/campo-de-contrasena";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { registrarse, registrarseComoCuidador } from "@/lib/acciones/cuenta";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { LARGO_MINIMO_DE_CONTRASENA } from "@/lib/acciones/validar-cuenta";

// `comoCuidador`: quien se postula para cuidar (su cuenta es de cuidador y empieza por armar su perfil).
export function FormularioRegistro({ comoCuidador = false }: { comoCuidador?: boolean }) {
  const [estado, accion, pendiente] = useActionState(comoCuidador ? registrarseComoCuidador : registrarse, ESTADO_INICIAL);
  const errorDePolitica = estado.errores?.aceptaPolitica;

  return (
    <form action={accion} className="flex flex-col gap-5">
      <ResumenDelFormulario estado={estado} />
      <Campo
        nombre="nombre"
        etiqueta="Tu nombre"
        icono={User}
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={estado.valores?.nombre}
        error={estado.errores?.nombre}
      />
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
      <Campo
        nombre="telefono"
        etiqueta="Celular (opcional)"
        type="tel"
        icono={Phone}
        autoComplete="tel"
        inputMode="tel"
        ayuda="Por ejemplo, 300 123 4567."
        defaultValue={estado.valores?.telefono}
        error={estado.errores?.telefono}
      />
      <CampoDeContrasena
        nombre="contrasena"
        etiqueta="Contraseña"
        autoComplete="new-password"
        required
        minLength={LARGO_MINIMO_DE_CONTRASENA}
        ayuda={`Mínimo ${LARGO_MINIMO_DE_CONTRASENA} caracteres. Evita las que todo el mundo usa, como 1234567890.`}
        error={estado.errores?.contrasena}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="aceptaPolitica" className="flex min-h-12 items-start gap-3 text-base">
          <input
            id="aceptaPolitica"
            name="aceptaPolitica"
            type="checkbox"
            required
            defaultChecked={estado.valores?.aceptaPolitica === "on"}
            aria-invalid={errorDePolitica !== undefined ? true : undefined}
            aria-describedby={errorDePolitica !== undefined ? "aceptaPolitica-error" : undefined}
            className="mt-0.5 size-6 shrink-0 accent-primary"
          />
          <span>
            Acepto la{" "}
            <Link href="/privacidad" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
              política de tratamiento de datos
            </Link>{" "}
            y los{" "}
            <Link href="/terminos" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
              términos y condiciones
            </Link>
            .
          </span>
        </label>
        {errorDePolitica !== undefined && <MensajeDeCampo id="aceptaPolitica-error">{errorDePolitica}</MensajeDeCampo>}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Creando tu cuenta…" : "Crear cuenta"}
      </Button>
      <p className="text-center text-base text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="inline-flex min-h-12 items-center font-medium text-primary underline underline-offset-4">
          Ingresar
        </Link>
      </p>
    </form>
  );
}
