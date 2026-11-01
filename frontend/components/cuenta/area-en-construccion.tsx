import { Hammer } from "lucide-react";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";

// Las áreas de cuidador y administrador llegan en F4 y F9. Quien ya tiene cuenta de ese tipo puede ingresar, y
// se le dice con claridad que su panel todavía no está: no se finge nada.
export function AreaEnConstruccion({ titulo, nombre }: { titulo: string; nombre: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Hammer className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-foreground">Hola, {nombre}</h1>
      <p className="text-base text-muted-foreground">
        Tu cuenta funciona, pero el {titulo} todavía lo estamos construyendo. Cuando esté listo, lo encontrarás aquí.
      </p>
      <SalirDeLaCuenta />
    </div>
  );
}
