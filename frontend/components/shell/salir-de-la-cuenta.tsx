import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cerrarSesion } from "@/lib/acciones/cuenta";

// Un formulario con la acción de servidor: funciona incluso sin JavaScript.
export function SalirDeLaCuenta({ compacto = false }: { compacto?: boolean }) {
  return (
    <form action={cerrarSesion}>
      <Button type="submit" variant="outline" size={compacto ? "sm" : "default"}>
        <LogOut aria-hidden="true" />
        Salir
      </Button>
    </form>
  );
}
