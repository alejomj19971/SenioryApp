import type { Metadata } from "next";
import { EntradaConMovimiento } from "@/components/cuenta/entrada-con-movimiento";
import { FondoDecorativo } from "@/components/cuenta/fondo-decorativo";
import { TarjetaDeAcceso } from "@/components/cuenta/tarjeta-de-acceso";
import { FormularioIngresar } from "@/components/cuenta/formulario-ingresar";
import { rutaInternaSegura } from "@/lib/redireccion";

export const metadata: Metadata = { title: "Ingresar" };

export default async function IngresarPage({ searchParams }: PageProps<"/ingresar">) {
  const consulta = await searchParams;
  const volver = typeof consulta.volver === "string" ? consulta.volver : undefined;

  return (
    <div className="relative isolate">
      <FondoDecorativo />
      <EntradaConMovimiento>
        <TarjetaDeAcceso className="relative z-10">
          <div className="flex flex-col gap-1">
            <span aria-hidden="true" className="mb-1 h-1 w-10 rounded-full bg-success" />
            <h1 className="font-serif text-3xl font-bold text-foreground">Ingresar</h1>
            <p className="text-base text-muted-foreground">Qué bueno verte de nuevo.</p>
          </div>
          <FormularioIngresar
            // Solo una ruta de este sitio: `volver` lo puede escribir cualquiera.
            volver={rutaInternaSegura(volver) ?? undefined}
            contrasenaRestablecida={consulta.restablecida === "1"}
          />
        </TarjetaDeAcceso>
      </EntradaConMovimiento>
    </div>
  );
}
