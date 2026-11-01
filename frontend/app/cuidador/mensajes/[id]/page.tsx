import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/mensajeria/chat";
import { exigirRol } from "@/lib/sesion";
import { listarMensajes, obtenerConversacion } from "@/lib/services/mensajeria";

export const metadata: Metadata = { title: "Conversación" };

// Una conversación del cuidador. Si no existe o no es suya, el backend la trata igual: 404.
export default async function ConversacionDelCuidadorPage({ params }: PageProps<"/cuidador/mensajes/[id]">) {
  const { id } = await params;
  await exigirRol("cuidador");
  const conversacion = await obtenerConversacion(id);
  if (conversacion === null) notFound();
  const pagina = await listarMensajes(conversacion.id);
  return <Chat key={conversacion.id} conversacion={conversacion} inicial={pagina.mensajes} anteriores={pagina.anteriores} base="/cuidador" />;
}
