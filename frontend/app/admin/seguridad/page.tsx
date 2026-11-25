import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SegundoFactor } from "@/components/admin/segundo-factor";
import { exigirRol } from "@/lib/sesion";
import { obtenerEstadoDeSegundoFactor } from "@/lib/services/segundo-factor";

export const metadata: Metadata = { title: "Seguridad de tu cuenta" };

// La verificación en dos pasos del propio administrador (M1, decisión 4).
export default async function SeguridadPage() {
  await exigirRol("administrador");
  const { activo } = await obtenerEstadoDeSegundoFactor();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Panel del administrador
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Seguridad de tu cuenta</h1>
        <p className="text-base text-muted-foreground">Verificación en dos pasos al iniciar sesión.</p>
      </div>

      <section className="max-w-md rounded-2xl bg-card p-5 ring-1 ring-border">
        <SegundoFactor activo={activo} />
      </section>
    </div>
  );
}
