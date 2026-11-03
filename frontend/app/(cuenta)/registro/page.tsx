import type { Metadata } from "next";
import { EntradaConMovimiento } from "@/components/cuenta/entrada-con-movimiento";
import { FondoDecorativo } from "@/components/cuenta/fondo-decorativo";
import { SelectorDeTipoDeCuenta } from "@/components/cuenta/selector-de-tipo-de-cuenta";
import { TarjetaDeAcceso } from "@/components/cuenta/tarjeta-de-acceso";
import { FormularioRegistro } from "@/components/cuenta/formulario-registro";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return (
    <div className="relative isolate flex flex-col gap-6">
      <FondoDecorativo />
      <EntradaConMovimiento>
        <div className="relative z-10 flex flex-col gap-6">
          <SelectorDeTipoDeCuenta comoCuidador={false} />
          <TarjetaDeAcceso>
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-foreground">Crea tu cuenta</h1>
              <p className="text-base text-muted-foreground">
                Es gratis y te toma un minuto. Después te preguntaremos por la persona a la que vas a cuidar.
              </p>
            </div>
            <FormularioRegistro />
          </TarjetaDeAcceso>
        </div>
      </EntradaConMovimiento>
    </div>
  );
}
