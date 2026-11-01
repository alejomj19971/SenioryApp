import type { Metadata } from "next";
import { FormularioRecuperar } from "@/components/cuenta/formulario-recuperar";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecuperarPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">¿Olvidaste tu contraseña?</h1>
        <p className="text-base text-muted-foreground">
          Escribe el correo de tu cuenta y te enviamos un enlace para elegir una nueva.
        </p>
      </div>
      <FormularioRecuperar />
    </div>
  );
}
