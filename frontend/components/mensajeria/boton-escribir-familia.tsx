"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { abrirConversacionComoCuidadorAccion } from "@/lib/acciones/mensajeria";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

// Lo mismo que «Escribir» del lado de la familia, pero del lado del cuidador: abre (o recupera) la conversación con
// esa familia y lleva a ella. Solo con un servicio vivo con ella; si no, lo dice.
export function BotonEscribirALaFamilia({ familiarId, nombre, className }: { familiarId: string; nombre: string; className?: string }) {
  const [estado, accion, pendiente] = useActionState(abrirConversacionComoCuidadorAccion.bind(null, familiarId), ESTADO_INICIAL);
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
