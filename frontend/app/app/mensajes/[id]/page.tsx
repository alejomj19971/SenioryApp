import { notFound } from "next/navigation";
import { ChatMensajes } from "@/components/mensajeria/chat-mensajes";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import { listarMensajes } from "@/lib/services/mensajeria";

export default async function MensajesPage({
  params,
}: PageProps<"/app/mensajes/[id]">) {
  const { id } = await params;
  const [cuidador, mensajes] = await Promise.all([
    obtenerCuidador(id),
    listarMensajes(id),
  ]);

  if (!cuidador) {
    notFound();
  }

  return <ChatMensajes cuidador={cuidador} mensajesIniciales={mensajes} />;
}
