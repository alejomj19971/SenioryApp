"use client";

import { useEffect, useRef, useState } from "react";

function mensajeDeError(codigo: string): string {
  switch (codigo) {
    case "not-allowed":
    case "service-not-allowed":
      return "Activa el permiso de micrófono en tu navegador para usar comandos de voz.";
    case "no-speech":
      return "No escuché nada. Intenta de nuevo.";
    case "audio-capture":
      return "No encontramos un micrófono disponible.";
    default:
      return "No se pudo activar el micrófono. Intenta de nuevo.";
  }
}

/**
 * Envuelve la Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`).
 * `onResultado` recibe la transcripción cruda; si devuelve un string, se
 * muestra como mensaje temporal (por ejemplo, un error o una confirmación
 * de lo que se entendió). Si el navegador no soporta la API, `soportado`
 * queda en `false` y el consumidor debe ocultar su UI de voz.
 */
export function useReconocimientoVoz(onResultado: (transcripcion: string) => string | void) {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const reconocimientoRef = useRef<InstanceType<NonNullable<typeof window.SpeechRecognition>> | null>(null);
  const onResultadoRef = useRef(onResultado);

  useEffect(() => {
    onResultadoRef.current = onResultado;
  }, [onResultado]);

  useEffect(() => {
    const ReconocimientoVoz = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!ReconocimientoVoz) return;

    // Disponibilidad del navegador (sistema externo): se detecta una sola vez al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoportado(true);
    const reconocimiento = new ReconocimientoVoz();
    reconocimiento.lang = "es-CO";
    reconocimiento.continuous = false;
    reconocimiento.interimResults = false;

    reconocimiento.onresult = (evento: SpeechRecognitionEvent) => {
      const transcripcion = evento.results[0]?.[0]?.transcript ?? "";
      if (!transcripcion) {
        setMensaje("No escuché nada. Intenta de nuevo.");
        return;
      }
      const resultado = onResultadoRef.current(transcripcion);
      setMensaje(resultado ?? null);
    };
    reconocimiento.onend = () => setEscuchando(false);
    reconocimiento.onerror = (evento) => {
      setEscuchando(false);
      setMensaje(mensajeDeError(evento.error));
    };

    reconocimientoRef.current = reconocimiento;

    return () => {
      reconocimiento.stop();
    };
  }, []);

  useEffect(() => {
    if (!mensaje) return;
    const temporizador = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(temporizador);
  }, [mensaje]);

  function alternarEscucha() {
    if (!reconocimientoRef.current) return;
    setMensaje(null);
    if (escuchando) {
      reconocimientoRef.current.stop();
      setEscuchando(false);
      return;
    }
    reconocimientoRef.current.start();
    setEscuchando(true);
  }

  return { soportado, escuchando, mensaje, alternarEscucha };
}
