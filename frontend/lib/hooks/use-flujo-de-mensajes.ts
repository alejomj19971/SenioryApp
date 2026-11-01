"use client";

import { useEffect, useRef, useState } from "react";
import type { MensajeDeChat } from "@/lib/types";

// Los mensajes nuevos en vivo (F8). Abre un `EventSource` a `/api/mensajeria/eventos` (el servidor de Next lo reenvía
// desde el backend; el navegador nunca habla con el backend) y avisa de cada mensaje de cualquiera de mis
// conversaciones. Se reconecta solo:
//  - si el servidor cierra la conexión (cada 10 minutos, por diseño), el navegador retoma con `Last-Event-ID`;
//  - si la conexión muere del todo (sesión vencida, el servidor cayó), se reabre a mano con espera creciente y
//    `?desde=` con el último evento recibido, y tras 3 fallos seguidos se declara «sin flujo»: la pantalla pasa a
//    consultar cada pocos segundos (el respaldo) mientras sigue intentando volver.
// El backend entrega AL MENOS UNA VEZ: quien use esto debe reconocer los mensajes por su `id`.

export type EstadoDelFlujo = "conectando" | "en_vivo" | "reconectando" | "sin_flujo";

const FALLOS_ANTES_DEL_RESPALDO = 3;
const ESPERA_INICIAL_MS = 2_000;
const ESPERA_MAXIMA_MS = 30_000;

export interface MensajeDelFlujo {
  conversacionId: string;
  mensaje: MensajeDeChat;
}

// Lo que llega por la red es entrada de cualquiera: se valida la forma antes de usarlo.
export function leerMensajeDelFlujo(datos: string): MensajeDelFlujo | null {
  let objeto: unknown;
  try {
    objeto = JSON.parse(datos);
  } catch {
    return null;
  }
  if (typeof objeto !== "object" || objeto === null) return null;
  const { id, conversacionId, autor, texto, enviadoEn, idDeCliente } = objeto as Record<string, unknown>;
  if (typeof id !== "string" || typeof conversacionId !== "string" || typeof texto !== "string" || typeof enviadoEn !== "string") return null;
  if (autor !== "yo" && autor !== "otro") return null;
  return {
    conversacionId,
    mensaje: { id, ...(typeof idDeCliente === "string" ? { idDeCliente } : {}), autor, texto, enviadoEn, estado: "enviado" },
  };
}

export function useFlujoDeMensajes(alRecibir: (evento: MensajeDelFlujo) => void): EstadoDelFlujo {
  const [estado, setEstado] = useState<EstadoDelFlujo>("conectando");
  const alRecibirActual = useRef(alRecibir);
  useEffect(() => {
    alRecibirActual.current = alRecibir;
  });

  useEffect(() => {
    let cerrado = false;
    let fuente: EventSource | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let ultimoEvento: string | undefined;
    let fallos = 0;

    function abrir() {
      const direccion = ultimoEvento === undefined ? "/api/mensajeria/eventos" : `/api/mensajeria/eventos?desde=${encodeURIComponent(ultimoEvento)}`;
      const nueva = new EventSource(direccion);
      fuente = nueva;
      nueva.onopen = () => {
        fallos = 0;
        setEstado("en_vivo");
      };
      nueva.addEventListener("mensaje", (evento) => {
        if (evento.lastEventId !== "") ultimoEvento = evento.lastEventId;
        const recibido = leerMensajeDelFlujo(evento.data as string);
        if (recibido !== null) alRecibirActual.current(recibido);
      });
      nueva.onerror = () => {
        if (cerrado) return;
        // Conectando otra vez: el navegador lo hace solo y retoma con `Last-Event-ID`.
        if (nueva.readyState !== EventSource.CLOSED) {
          setEstado((actual) => (actual === "sin_flujo" ? actual : "reconectando"));
          return;
        }
        // Cerrada del todo (sesión vencida, error del servidor): se reabre a mano, con espera creciente.
        nueva.close();
        fallos += 1;
        setEstado(fallos >= FALLOS_ANTES_DEL_RESPALDO ? "sin_flujo" : "reconectando");
        temporizador = setTimeout(abrir, Math.min(ESPERA_MAXIMA_MS, ESPERA_INICIAL_MS * 2 ** (fallos - 1)));
      };
    }

    abrir();
    return () => {
      cerrado = true;
      if (temporizador !== null) clearTimeout(temporizador);
      fuente?.close();
    };
  }, []);

  return estado;
}
