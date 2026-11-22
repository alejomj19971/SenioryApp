import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FormularioDeHorario } from "@/components/postulacion/formulario-de-horario";
import { ahoraEnColombia } from "@/lib/fecha-colombia";
import { exigirRol } from "@/lib/sesion";
import { obtenerMiPerfil } from "@/lib/services/postulacion";

export const metadata: Metadata = { title: "Tu horario" };

// El horario semanal del cuidador, aparte del resto del perfil (F9): es lo que va a tocar seguido, así que
// tiene su propia pantalla y su propio botón en el panel, en vez de ir enterrado en "Tus datos".
export default async function HorarioDelCuidadorPage() {
  await exigirRol("cuidador");
  const perfil = await obtenerMiPerfil();
  if (perfil === null) redirect("/cuidador/perfil");

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Link href="/cuidador" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tu panel
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tu horario</h1>
        <p className="text-base text-muted-foreground">Las horas en las que atiendes, día por día.</p>
      </div>
      <FormularioDeHorario horariosLibres={perfil.horariosLibres} ahora={ahoraEnColombia()} />
    </div>
  );
}
