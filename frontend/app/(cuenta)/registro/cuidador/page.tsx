import type { Metadata } from "next";
import { EntradaConMovimiento } from "@/components/cuenta/entrada-con-movimiento";
import { FondoDecorativo } from "@/components/cuenta/fondo-decorativo";
import { SelectorDeTipoDeCuenta } from "@/components/cuenta/selector-de-tipo-de-cuenta";
import { TarjetaDeAcceso } from "@/components/cuenta/tarjeta-de-acceso";
import { FormularioRegistro } from "@/components/cuenta/formulario-registro";

export const metadata: Metadata = { title: "Postúlate como cuidador" };

export default function RegistroDeCuidadorPage() {
  return (
    <div className="relative isolate flex flex-col gap-6">
      <FondoDecorativo />
      <EntradaConMovimiento>
        <div className="relative z-10 flex flex-col gap-6">
          <SelectorDeTipoDeCuenta comoCuidador />
          <TarjetaDeAcceso>
            <div className="flex flex-col gap-1">
              <span aria-hidden="true" className="mb-1 h-1 w-10 rounded-full bg-success" />
              <h1 className="font-serif text-3xl font-bold text-foreground">Postúlate como cuidador</h1>
              <p className="text-base text-muted-foreground">
                Crea tu cuenta, arma tu perfil y sube tus documentos. Un revisor los verifica; cuando estén aprobados, las familias podrán encontrarte.
              </p>
            </div>
            <FormularioRegistro comoCuidador />
          </TarjetaDeAcceso>
        </div>
      </EntradaConMovimiento>
    </div>
  );
}
