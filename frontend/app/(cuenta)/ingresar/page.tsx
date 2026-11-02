import type { Metadata } from "next";
import { TarjetaDeAcceso } from "@/components/cuenta/tarjeta-de-acceso";
import { FormularioIngresar } from "@/components/cuenta/formulario-ingresar";
import { rutaInternaSegura } from "@/lib/redireccion";

export const metadata: Metadata = { title: "Ingresar" };

export default async function IngresarPage({ searchParams }: PageProps<"/ingresar">) {
  const consulta = await searchParams;
  const volver = typeof consulta.volver === "string" ? consulta.volver : undefined;

  return (
    <TarjetaDeAcceso>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Ingresar</h1>
        <p className="text-base text-muted-foreground">Qué bueno verte de nuevo.</p>
      </div>
      <FormularioIngresar
        // Solo una ruta de este sitio: `volver` lo puede escribir cualquiera.
        volver={rutaInternaSegura(volver) ?? undefined}
        contrasenaRestablecida={consulta.restablecida === "1"}
      />
    </TarjetaDeAcceso>
  );
}
