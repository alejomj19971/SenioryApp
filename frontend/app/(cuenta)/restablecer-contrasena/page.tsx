import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/ui/aviso";
import { FormularioRestablecer } from "@/components/cuenta/formulario-restablecer";

export const metadata: Metadata = { title: "Elegir una contraseña nueva" };

export default async function RestablecerContrasenaPage({ searchParams }: PageProps<"/restablecer-contrasena">) {
  const consulta = await searchParams;
  const token = typeof consulta.token === "string" ? consulta.token : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Elige una contraseña nueva</h1>
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
    </div>
  );
}
