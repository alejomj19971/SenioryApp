"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { abrirConversacionAccion } from "@/lib/acciones/mensajeria";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

// «Escribir»: abre (o recupera) la conversación con ese cuidador y lleva a ella. Solo con un servicio vivo con él o ella;
// si no, lo dice. Es un formulario (acción de servidor), así que también funciona sin JavaScript.
export function BotonEscribir({ cuidadorId, nombre, className }: { cuidadorId: string; nombre: string; className?: string }) {
  const [estado, accion, pendiente] = useActionState(abrirConversacionAccion.bind(null, cuidadorId), ESTADO_INICIAL);
  return (
    <form action={accion} className="flex flex-col gap-2">
      {estado.mensaje !== undefined && <Aviso titulo="No pudimos abrir el chat" descripcion={estado.mensaje} />}
      <Button type="submit" variant="outline" className={className} disabled={pendiente}>
        <MessageCircle aria-hidden="true" />
        {pendiente ? "Abriendo…" : `Escribir a ${nombre.split(" ")[0]}`}
      </Button>
    </form>
  );
}
