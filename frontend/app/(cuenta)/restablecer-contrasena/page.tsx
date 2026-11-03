import type { Metadata } from "next";
import Link from "next/link";
import { EntradaConMovimiento } from "@/components/cuenta/entrada-con-movimiento";
import { FondoDecorativo } from "@/components/cuenta/fondo-decorativo";
import { TarjetaDeAcceso } from "@/components/cuenta/tarjeta-de-acceso";
import { Aviso } from "@/components/ui/aviso";
import { FormularioRestablecer } from "@/components/cuenta/formulario-restablecer";

export const metadata: Metadata = { title: "Elegir una contraseña nueva" };

export default async function RestablecerContrasenaPage({ searchParams }: PageProps<"/restablecer-contrasena">) {
  const consulta = await searchParams;
  const token = typeof consulta.token === "string" ? consulta.token : "";

  return (
    <div className="relative isolate">
      <FondoDecorativo />
      <EntradaConMovimiento>
        <TarjetaDeAcceso className="relative z-10">
          <div className="flex flex-col gap-1">
            <span aria-hidden="true" className="mb-1 h-1 w-10 rounded-full bg-success" />
            <h1 className="font-serif text-3xl font-bold text-foreground">Elige una contraseña nueva</h1>
            <p className="text-base text-muted-foreground">Cuando la guardes, podrás ingresar con ella.</p>
          </div>
          {token === "" ? (
            <div className="flex flex-col gap-4">
              <Aviso titulo="Este enlace no es válido" descripcion="Pide uno nuevo desde «Olvidé mi contraseña»." />
              <Link href="/recuperar" className="inline-flex min-h-12 items-center justify-center font-medium text-primary underline underline-offset-4">
                Pedir un enlace nuevo
              </Link>
            </div>
          ) : (
            <FormularioRestablecer token={token} />
          )}
        </TarjetaDeAcceso>
      </EntradaConMovimiento>
    </div>
  );
}
