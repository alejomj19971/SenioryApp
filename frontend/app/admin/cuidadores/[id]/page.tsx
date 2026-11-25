import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExpedienteDelCuidador } from "@/components/admin/expediente-del-cuidador";
import { exigirRol } from "@/lib/sesion";
import { obtenerExpediente } from "@/lib/services/verificaciones";

export const metadata: Metadata = { title: "Expediente del cuidador" };

// El expediente de un cuidador: sus tres controles y todos sus documentos, para revisarlos desde el listado. Solo
// administradores; cada apertura del expediente y de cada documento queda en la auditoría del backend.
export default async function ExpedientePage({ params }: PageProps<"/admin/cuidadores/[id]">) {
  await exigirRol("administrador");
  const { id } = await params;
  const expediente = await obtenerExpediente(id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Cuidadores
      </Link>
      <ExpedienteDelCuidador expediente={expediente} />
    </div>
  );
}
