"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Send } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { cargarMensajesAccion, enviarMensajeAccion } from "@/lib/acciones/mensajeria";
import { formatearHora } from "@/lib/format";
import { useFlujoDeMensajes, type MensajeDelFlujo } from "@/lib/hooks/use-flujo-de-mensajes";
import { fusionarMensajes, idLocalDe, marcarEnviando, marcarFallido, quitarLocal } from "@/lib/mensajes-de-chat";
import { cn } from "@/lib/utils";
import type { Conversacion, MensajeDeChat } from "@/lib/types";

const LARGO_MAXIMO = 1000;
const AVISAR_DESDE = 900;
// Sin conexión en vivo, la pantalla consulta con esta frecuencia (el respaldo).
const RESPALDO_CADA_MS = 10_000;

interface ChatProps {
  conversacion: Conversacion;
  // Los mensajes que ya trajo el servidor (de los más antiguos a los más recientes).
  inicial: MensajeDeChat[];
  // Para pedir los anteriores; null si no hay más.
  anteriores: string | null;
  // «/app» (familia) o «/cuidador»: de dónde viene y a dónde vuelve.
  base: "/app" | "/cuidador";
}

// El chat (F8). Solo guarda y entrega mensajes: NO hay «en línea» ni «escribiendo…» (H11) porque el sistema no sabe
// nada de eso. Los mensajes llegan en vivo por el flujo del servidor y se reconocen por su `id` (el backend entrega al
// menos una vez). Lo que se escribe aparece de inmediato y, si no se puede enviar, se dice y se puede reintentar (con
// el MISMO `idDeCliente`, así no se duplica).
export function Chat({ conversacion, inicial, anteriores: primerosAnteriores, base }: ChatProps) {
  const [mensajes, setMensajes] = useState(inicial);
  const [anteriores, setAnteriores] = useState(primerosAnteriores);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [puedeEscribir, setPuedeEscribir] = useState(conversacion.puedeEscribir);
  const finRef = useRef<HTMLDivElement>(null);
  const textosPendientes = useRef(new Map<string, string>());

  // ── En vivo ──────────────────────────────────────────────────────────────────────────────────────────────────
  const alRecibir = useCallback(
    ({ conversacionId, mensaje }: MensajeDelFlujo) => {
      if (conversacionId === conversacion.id) setMensajes((actuales) => fusionarMensajes(actuales, [mensaje]));
    },
    [conversacion.id],
  );
  const estadoDelFlujo = useFlujoDeMensajes(alRecibir);

  // El respaldo: sin conexión en vivo, se consulta cada pocos segundos.
  useEffect(() => {
    if (estadoDelFlujo !== "sin_flujo") return;
    const intervalo = setInterval(async () => {
      const resultado = await cargarMensajesAccion(conversacion.id);
      if (resultado.ok) setMensajes((actuales) => fusionarMensajes(actuales, resultado.pagina.mensajes));
    }, RESPALDO_CADA_MS);
    return () => clearInterval(intervalo);
  }, [estadoDelFlujo, conversacion.id]);

  const ultimoId = mensajes.at(-1)?.id;
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [ultimoId]);

  // ── Enviar ──────────────────────────────────────────────────────────────────────────────────────────────────
  async function enviar(contenido: string, idDeCliente: string) {
    textosPendientes.current.set(idDeCliente, contenido);
    const resultado = await enviarMensajeAccion(conversacion.id, contenido, idDeCliente);
    if (resultado.ok) {
      textosPendientes.current.delete(idDeCliente);
      setError(null);
      setMensajes((actuales) => fusionarMensajes(actuales, [resultado.mensaje]));
      return;
    }
    setMensajes((actuales) => marcarFallido(actuales, idDeCliente));
    setError(resultado.mensaje);
    // El servicio terminó mientras se escribía: ya no se puede (leer sí).
    if (resultado.mensaje.startsWith("Ya no se puede escribir")) setPuedeEscribir(false);
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    const contenido = texto.trim();
    if (contenido === "" || [...contenido].length > LARGO_MAXIMO) return;
    const idDeCliente = crypto.randomUUID();
    setMensajes((actuales) =>
      fusionarMensajes(actuales, [{ id: idLocalDe(idDeCliente), idDeCliente, autor: "yo", texto: contenido, enviadoEn: new Date().toISOString(), estado: "enviando" }]),
    );
    setTexto("");
    void enviar(contenido, idDeCliente);
  }

  function reintentar(mensaje: MensajeDeChat) {
    if (mensaje.idDeCliente === undefined) return;
    const idDeCliente = mensaje.idDeCliente;
    setMensajes((actuales) => marcarEnviando(actuales, idDeCliente));
    void enviar(mensaje.texto, idDeCliente);
  }

  function descartar(mensaje: MensajeDeChat) {
    if (mensaje.idDeCliente === undefined) return;
    const idDeCliente = mensaje.idDeCliente;
    setMensajes((actuales) => quitarLocal(actuales, idDeCliente));
    textosPendientes.current.delete(idDeCliente);
    setError(null);
  }

  // ── Anteriores ──────────────────────────────────────────────────────────────────────────────────────────────
  async function verAnteriores() {
    if (anteriores === null || cargandoAnteriores) return;
    setCargandoAnteriores(true);
    const resultado = await cargarMensajesAccion(conversacion.id, anteriores);
    setCargandoAnteriores(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
      return;
    }
    setMensajes((actuales) => fusionarMensajes(actuales, resultado.pagina.mensajes));
    setAnteriores(resultado.pagina.anteriores);
  }

  const largo = [...texto].length;

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <Link href={`${base}/mensajes`} className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Mensajes
      </Link>

      <div className="flex items-center gap-3">
        <AvatarCuidador nombre={conversacion.otraParte.nombre} foto={conversacion.otraParte.foto} />
        <h1 className="text-lg font-semibold text-foreground">{conversacion.otraParte.nombre}</h1>
      </div>

      {(estadoDelFlujo === "reconectando" || estadoDelFlujo === "sin_flujo") && (
        <p role="status" className="rounded-xl bg-muted p-3 text-base text-muted-foreground">
          {estadoDelFlujo === "reconectando" ? "Reconectando…" : "Sin conexión en vivo: los mensajes nuevos se actualizan cada pocos segundos."}
        </p>
      )}

      {anteriores !== null && (
        <Button type="button" variant="outline" className="w-fit self-center" onClick={verAnteriores} disabled={cargandoAnteriores}>
          {cargandoAnteriores ? "Cargando…" : "Ver mensajes anteriores"}
        </Button>
      )}

      <div role="log" aria-label="Mensajes" aria-live="polite" className={cn("flex flex-col gap-3", puedeEscribir ? "pb-36" : "pb-10")}>
        {mensajes.length === 0 && (
          <p className="rounded-2xl bg-muted p-4 text-center text-base text-muted-foreground">
            {puedeEscribir ? "Todavía no hay mensajes. Escribe el primero." : "No se escribieron mensajes en esta conversación."}
          </p>
        )}
        {mensajes.map((mensaje) => {
          const mio = mensaje.autor === "yo";
          return (
            <div key={mensaje.id} className={cn("flex flex-col gap-1", mio ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-base break-words whitespace-pre-wrap",
                  mio ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground",
                  mensaje.estado === "enviando" && "opacity-70",
                  mensaje.estado === "fallido" && "ring-2 ring-destructive",
                )}
              >
                {mensaje.texto}
              </div>
              {mensaje.estado === "enviado" && <span className="px-1 text-sm text-muted-foreground">{formatearHora(mensaje.enviadoEn)}</span>}
              {mensaje.estado === "enviando" && <span className="px-1 text-sm text-muted-foreground">Enviando…</span>}
              {mensaje.estado === "fallido" && (
                <span className="flex items-center gap-2 px-1 text-sm font-medium text-destructive">
                  No se envió
                  <Button type="button" variant="outline" size="sm" onClick={() => reintentar(mensaje)}>
                    <RotateCcw aria-hidden="true" />
                    Reintentar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => descartar(mensaje)}>
                    Descartar
                  </Button>
                </span>
              )}
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {error !== null && <Aviso titulo="No pudimos completar la acción" descripcion={error} />}

      {puedeEscribir ? (
        <form
          onSubmit={alEnviar}
          className={cn(
            "fixed inset-x-0 z-20 mx-auto flex w-full max-w-md flex-col gap-1 border-t border-border bg-background/95 p-3 backdrop-blur",
            base === "/app" ? "bottom-16" : "bottom-0",
          )}
        >
          <div className="flex items-center gap-2">
            <label htmlFor="mensaje" className="sr-only">
              Mensaje para {conversacion.otraParte.nombre}
            </label>
            <input
              id="mensaje"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              placeholder={`Escríbele a ${conversacion.otraParte.nombre.split(" ")[0]}…`}
              autoComplete="off"
              className="h-12 flex-1 rounded-full border border-input bg-card px-4 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button type="submit" size="icon-lg" aria-label="Enviar mensaje" disabled={texto.trim() === "" || largo > LARGO_MAXIMO}>
              <Send aria-hidden="true" />
            </Button>
          </div>
          {largo >= AVISAR_DESDE && (
            <p className={cn("px-2 text-sm", largo > LARGO_MAXIMO ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite">
              {largo}/{LARGO_MAXIMO} caracteres
            </p>
          )}
        </form>
      ) : (
        <p role="note" className="rounded-2xl bg-muted p-4 text-base text-foreground">
          El servicio terminó, así que ya no se puede escribir en esta conversación. Puedes leer lo que se escribió.
        </p>
      )}
    </div>
  );
}
