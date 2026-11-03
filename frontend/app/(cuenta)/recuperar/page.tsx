import type { Metadata } from "next";
import { EntradaConMovimiento } from "@/components/cuenta/entrada-con-movimiento";
import { FondoDecorativo } from "@/components/cuenta/fondo-decorativo";
import { TarjetaDeAcceso } from "@/components/cuenta/tarjeta-de-acceso";
import { FormularioRecuperar } from "@/components/cuenta/formulario-recuperar";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecuperarPage() {
  return (
    <div className="relative isolate">
      <FondoDecorativo />
      <EntradaConMovimiento>
        <TarjetaDeAcceso className="relative z-10">
          <div className="flex flex-col gap-1">
            <span aria-hidden="true" className="mb-1 h-1 w-10 rounded-full bg-success" />
            <h1 className="font-serif text-3xl font-bold text-foreground">¿Olvidaste tu contraseña?</h1>
            <p className="text-base text-muted-foreground">
              Escribe el correo de tu cuenta y te enviamos un enlace para elegir una nueva.
            </p>
          </div>
          <FormularioRecuperar />
        </TarjetaDeAcceso>
      </EntradaConMovimiento>
    </div>
  );
}
