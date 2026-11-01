import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { ListaDeAvisos } from "@/components/avisos/lista-de-avisos";
import { MarcarAvisosVistos } from "@/components/avisos/marcar-avisos-vistos";
import { COOKIE_DE_AVISOS_VISTOS } from "@/lib/avisos";
import { exigirRol } from "@/lib/sesion";
import { listarAvisos } from "@/lib/services/notificaciones";

export const metadata: Metadata = { title: "Avisos" };

// Los avisos del cuidador (F5): solicitudes nuevas, servicios y mensajes.
export default async function AvisosDelCuidadorPage() {
  await exigirRol("cuidador");
  const pagina = await listarAvisos();
  const vistoHasta = (await cookies()).get(COOKIE_DE_AVISOS_VISTOS)?.value;
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Link href="/cuidador" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tu panel
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avisos</h1>
        <p className="text-base text-muted-foreground">Tus solicitudes nuevas, servicios y mensajes.</p>
      </div>
      <ListaDeAvisos inicial={pagina.avisos} siguiente={pagina.siguiente} vistoHasta={vistoHasta} base="/cuidador" />
      <MarcarAvisosVistos hasta={pagina.avisos[0]?.creadaEn} />
    </div>
  );
}
