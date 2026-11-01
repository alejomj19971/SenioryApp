import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/mensajeria/chat";
import { listarMensajes, obtenerConversacion } from "@/lib/services/mensajeria";

export const metadata: Metadata = { title: "Conversación" };

// Una conversación de la familia. Si no existe o no es suya, el backend la trata igual: 404.
export default async function ConversacionPage({ params }: PageProps<"/app/mensajes/[id]">) {
  const { id } = await params;
  const conversacion = await obtenerConversacion(id);
  if (conversacion === null) notFound();
  const pagina = await listarMensajes(conversacion.id);
  return <Chat key={conversacion.id} conversacion={conversacion} inicial={pagina.mensajes} anteriores={pagina.anteriores} base="/app" />;
}
