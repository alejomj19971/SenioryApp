import type { Metadata } from "next";
import { SelectorDeTipoDeCuenta } from "@/components/cuenta/selector-de-tipo-de-cuenta";
import { FormularioRegistro } from "@/components/cuenta/formulario-registro";

export const metadata: Metadata = { title: "Postúlate como cuidador" };

export default function RegistroDeCuidadorPage() {
  return (
    <div className="flex flex-col gap-6">
      <SelectorDeTipoDeCuenta comoCuidador />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Postúlate como cuidador</h1>
        <p className="text-base text-muted-foreground">
          Crea tu cuenta, arma tu perfil y sube tus documentos. Un revisor los verifica; cuando estén aprobados, las familias podrán encontrarte.
        </p>
      </div>
      <FormularioRegistro comoCuidador />
    </div>
  );
}
