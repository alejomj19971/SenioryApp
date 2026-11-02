import type { Metadata } from "next";
import Link from "next/link";
import { FormularioRegistro } from "@/components/cuenta/formulario-registro";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Crea tu cuenta</h1>
        <p className="text-base text-muted-foreground">
          Es gratis y te toma un minuto. Después te preguntaremos por la persona a la que vas a cuidar.
        </p>
      </div>
      <FormularioRegistro />
      <p className="text-center text-base text-muted-foreground">
        ¿Eres cuidador?{" "}
        <Link href="/registro/cuidador" className="inline-flex min-h-12 items-center font-medium text-primary underline underline-offset-4">
          Postúlate aquí
        </Link>
      </p>
    </div>
  );
}
