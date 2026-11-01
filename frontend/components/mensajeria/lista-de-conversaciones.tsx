import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { formatearFechaHora } from "@/lib/format";
import type { Conversacion } from "@/lib/types";

// Mis conversaciones, la de la última charla primero. De la otra parte solo se ve el nombre y la foto.
export function ListaDeConversaciones({ conversaciones, base }: { conversaciones: Conversacion[]; base: "/app" | "/cuidador" }) {
  if (conversaciones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
        <MessageCircle className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-base font-medium text-foreground">Todavía no tienes conversaciones</p>
        <p className="text-base text-muted-foreground">
          {base === "/app"
            ? "Cuando pidas un servicio podrás escribirle al cuidador desde el detalle del servicio."
            : "Cuando una familia te escriba, la conversación aparece aquí."}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {conversaciones.map((conversacion) => (
        <li key={conversacion.id}>
          <Link
            href={`${base}/mensajes/${conversacion.id}`}
            className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:ring-primary/40"
          >
            <AvatarCuidador nombre={conversacion.otraParte.nombre} foto={conversacion.otraParte.foto} size="lg" />
            <div className="flex-1">
              <p className="text-base font-semibold text-foreground">{conversacion.otraParte.nombre}</p>
              <p className="text-sm text-muted-foreground">
                {conversacion.ultimoMensajeEn === null ? "Sin mensajes todavía" : `Último mensaje: ${formatearFechaHora(conversacion.ultimoMensajeEn)}`}
                {!conversacion.puedeEscribir && " · Solo lectura"}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
