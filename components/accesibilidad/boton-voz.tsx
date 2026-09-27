"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComandoVoz {
  frases: string[];
  accion: (router: ReturnType<typeof useRouter>) => void;
}

const comandos: ComandoVoz[] = [
  { frases: ["buscar cuidador", "buscar cuidadores"], accion: (router) => router.push("/app/cuidadores") },
  { frases: ["teleasistencia"], accion: (router) => router.push("/app/teleasistencia") },
  { frases: ["alerta", "ayuda"], accion: (router) => router.push("/app/teleasistencia?alerta=1") },
  { frases: ["inicio"], accion: (router) => router.push("/app") },
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function BotonVoz() {
  const router = useRouter();
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const reconocimientoRef = useRef<InstanceType<NonNullable<typeof window.SpeechRecognition>> | null>(null);

  useEffect(() => {
    const ReconocimientoVoz =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!ReconocimientoVoz) return;

    // Disponibilidad del navegador (sistema externo): se detecta una sola vez al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoportado(true);
    const reconocimiento = new ReconocimientoVoz();
    reconocimiento.lang = "es-CO";
    reconocimiento.continuous = false;
    reconocimiento.interimResults = false;

    reconocimiento.onresult = (evento: SpeechRecognitionEvent) => {
      const transcripcion = normalizar(evento.results[0]?.[0]?.transcript ?? "");
      const comando = comandos.find((c) =>
        c.frases.some((frase) => transcripcion.includes(frase)),
      );
      comando?.accion(router);
    };
    reconocimiento.onend = () => setEscuchando(false);
    reconocimiento.onerror = () => setEscuchando(false);

    reconocimientoRef.current = reconocimiento;

    return () => {
      reconocimiento.stop();
    };
  }, [router]);

  if (!soportado) return null;

  function alternarEscucha() {
    if (!reconocimientoRef.current) return;
    if (escuchando) {
      reconocimientoRef.current.stop();
      setEscuchando(false);
      return;
    }
    reconocimientoRef.current.start();
    setEscuchando(true);
  }

  return (
    <button
      type="button"
      onClick={alternarEscucha}
      aria-pressed={escuchando}
      aria-label={
        escuchando
          ? "Detener comando de voz"
          : 'Activar comando de voz: di "buscar cuidador", "teleasistencia", "alerta" o "inicio"'
      }
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        escuchando
          ? "animate-pulse border-destructive bg-destructive text-white"
          : "border-primary bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {escuchando ? (
        <MicOff className="size-5" aria-hidden="true" />
      ) : (
        <Mic className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}
