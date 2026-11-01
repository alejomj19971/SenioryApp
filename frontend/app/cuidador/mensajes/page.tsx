import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ListaDeConversaciones } from "@/components/mensajeria/lista-de-conversaciones";
import { exigirRol } from "@/lib/sesion";
import { listarConversaciones } from "@/lib/services/mensajeria";

export const metadata: Metadata = { title: "Mensajes" };

// Las conversaciones del cuidador con las familias que le escribieron (F8). Solo la familia abre una conversación.
export default async function MensajesDelCuidadorPage() {
  await exigirRol("cuidador");
  const conversaciones = await listarConversaciones();
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Link href="/cuidador" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tu panel
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mensajes</h1>
        <p className="text-base text-muted-foreground">Tus conversaciones con las familias.</p>
      </div>
      <ListaDeConversaciones conversaciones={conversaciones} base="/cuidador" />
    </div>
  );
}
