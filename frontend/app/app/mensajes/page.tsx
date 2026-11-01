import type { Metadata } from "next";
import { ListaDeConversaciones } from "@/components/mensajeria/lista-de-conversaciones";
import { listarConversaciones } from "@/lib/services/mensajeria";

export const metadata: Metadata = { title: "Mensajes" };

// Las conversaciones de la familia con sus cuidadores (F8).
export default async function MensajesPage() {
  const conversaciones = await listarConversaciones();
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mensajes</h1>
        <p className="text-base text-muted-foreground">Tus conversaciones con los cuidadores.</p>
      </div>
      <ListaDeConversaciones conversaciones={conversaciones} base="/app" />
    </div>
  );
}
