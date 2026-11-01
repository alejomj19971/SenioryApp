import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ListaDeAvisos } from "@/components/avisos/lista-de-avisos";
import { MarcarAvisosVistos } from "@/components/avisos/marcar-avisos-vistos";
import { COOKIE_DE_AVISOS_VISTOS } from "@/lib/avisos";
import { listarAvisos } from "@/lib/services/notificaciones";

export const metadata: Metadata = { title: "Avisos" };

// Los avisos de la familia (F5): la campana.
export default async function AvisosPage() {
  const pagina = await listarAvisos();
  const vistoHasta = (await cookies()).get(COOKIE_DE_AVISOS_VISTOS)?.value;
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avisos</h1>
        <p className="text-base text-muted-foreground">Lo que pasa con tus servicios, pagos y mensajes.</p>
      </div>
      <ListaDeAvisos inicial={pagina.avisos} siguiente={pagina.siguiente} vistoHasta={vistoHasta} base="/app" />
      <MarcarAvisosVistos hasta={pagina.avisos[0]?.creadaEn} />
    </div>
  );
}
