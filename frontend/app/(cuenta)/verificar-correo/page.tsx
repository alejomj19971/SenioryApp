import type { Metadata } from "next";
import Link from "next/link";
import { EntradaConMovimiento } from "@/components/cuenta/entrada-con-movimiento";
import { FondoDecorativo } from "@/components/cuenta/fondo-decorativo";
import { FormularioConfirmarCorreo } from "@/components/cuenta/formulario-confirmar-correo";
import { TarjetaDeAcceso } from "@/components/cuenta/tarjeta-de-acceso";
import { Aviso } from "@/components/ui/aviso";

export const metadata: Metadata = { title: "Confirmar tu correo" };

// A donde lleva el enlace del correo de bienvenida. Pública: se abre desde el correo, quizá en otro navegador. Confirmar es
// un botón (una acción de servidor), no algo que ocurre al cargar la página.
export default async function VerificarCorreoPage({ searchParams }: PageProps<"/verificar-correo">) {
  const consulta = await searchParams;
  const token = typeof consulta.token === "string" ? consulta.token : "";

  return (
    <div className="relative isolate">
      <FondoDecorativo />
      <EntradaConMovimiento>
        <TarjetaDeAcceso className="relative z-10">
          <div className="flex flex-col gap-1">
            <span aria-hidden="true" className="mb-1 h-1 w-10 rounded-full bg-success" />
            <h1 className="font-serif text-3xl font-bold text-foreground">Confirma tu correo</h1>
            <p className="text-base text-muted-foreground">Un último paso para recibir avisos de tus servicios por correo.</p>
          </div>
          {token === "" ? (
            <div className="flex flex-col gap-4">
              <Aviso titulo="Este enlace no es válido" descripcion="Entra a tu cuenta y pide uno nuevo desde el aviso «Confirma tu correo»." />
              <Link href="/app" className="inline-flex min-h-12 items-center justify-center font-medium text-primary underline underline-offset-4">
                Ir a mi cuenta
              </Link>
            </div>
          ) : (
            <FormularioConfirmarCorreo token={token} />
          )}
        </TarjetaDeAcceso>
      </EntradaConMovimiento>
    </div>
  );
}
