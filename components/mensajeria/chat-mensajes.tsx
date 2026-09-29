"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { formatearHora } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Cuidador, Mensaje } from "@/lib/types";

const RESPUESTAS_AUTOMATICAS = [
  "Recibido, gracias por avisar.",
  "Todo bien por aquí, no te preocupes.",
  "Claro, te cuento apenas pase algo.",
  "Perfecto, quedo pendiente.",
];

function idAleatorio(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatMensajes({
  cuidador,
  mensajesIniciales,
}: {
  cuidador: Cuidador;
  mensajesIniciales: Mensaje[];
}) {
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const primerNombreCuidador = cuidador.nombre.split(" ")[0];

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, escribiendo]);

  function enviarMensaje(evento: FormEvent) {
    evento.preventDefault();
    const contenido = texto.trim();
    if (!contenido) return;

    setMensajes((actuales) => [
      ...actuales,
      { id: idAleatorio(), autor: "familiar", texto: contenido, fecha: new Date().toISOString() },
    ]);
    setTexto("");
    setEscribiendo(true);

    setTimeout(() => {
      const respuesta =
        RESPUESTAS_AUTOMATICAS[Math.floor(Math.random() * RESPUESTAS_AUTOMATICAS.length)];
      setMensajes((actuales) => [
        ...actuales,
        { id: idAleatorio(), autor: "cuidador", texto: respuesta, fecha: new Date().toISOString() },
      ]);
      setEscribiendo(false);
    }, 1800);
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <Link
        href="/app/teleasistencia"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a Teleasistencia
      </Link>

      <div className="flex items-center gap-3">
        <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} />
        <div>
          <p className="text-base font-semibold text-foreground">{cuidador.nombre}</p>
          <p className="text-xs text-primary">{escribiendo ? "Escribiendo…" : "En línea"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-28">
        {mensajes.map((mensaje) => {
          const esFamiliar = mensaje.autor === "familiar";
          return (
            <div
              key={mensaje.id}
              className={cn("flex flex-col gap-0.5", esFamiliar ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                  esFamiliar
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground",
                )}
              >
                {mensaje.texto}
              </div>
              <span className="px-1 text-[11px] text-muted-foreground">
                {formatearHora(mensaje.fecha)}
              </span>
            </div>
          );
        })}

        {escribiendo && (
          <div className="flex items-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={enviarMensaje}
        className="fixed inset-x-0 bottom-16 z-20 mx-auto flex w-full max-w-md items-center gap-2 border-t border-border bg-background/95 p-3 backdrop-blur"
      >
        <input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder={`Escríbele a ${primerNombreCuidador}…`}
          aria-label={`Mensaje para ${cuidador.nombre}`}
          className="h-12 flex-1 rounded-full border border-border bg-background px-4 text-base text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!texto.trim()}
          aria-label="Enviar mensaje"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send className="size-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
