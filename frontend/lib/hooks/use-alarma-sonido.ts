"use client";

import { useEffect, useRef } from "react";

let audioContextCompartido: AudioContext | null = null;

function obtenerAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  if (!audioContextCompartido) {
    audioContextCompartido = new AudioContext();
  }
  return audioContextCompartido;
}

function reproducirBeep(contexto: AudioContext) {
  const inicio = contexto.currentTime;
  [0, 0.22].forEach((retraso, indice) => {
    const oscilador = contexto.createOscillator();
    const ganancia = contexto.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = indice === 0 ? 880 : 660;
    ganancia.gain.setValueAtTime(0, inicio + retraso);
    ganancia.gain.linearRampToValueAtTime(0.25, inicio + retraso + 0.02);
    ganancia.gain.linearRampToValueAtTime(0, inicio + retraso + 0.18);
    oscilador.connect(ganancia);
    ganancia.connect(contexto.destination);
    oscilador.start(inicio + retraso);
    oscilador.stop(inicio + retraso + 0.2);
  });
}

/**
 * Suena en loop mientras `activa` sea true. Requiere que el navegador ya haya
 * recibido una interacción del usuario (click/tecla) en la página, por las
 * políticas de autoplay — por eso se "desbloquea" el AudioContext en el
 * primer gesto, aunque ocurra antes de que la alarma se active.
 */
export function useAlarmaSonido(activa: boolean) {
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function desbloquear() {
      obtenerAudioContext()?.resume().catch(() => {});
    }
    window.addEventListener("pointerdown", desbloquear, { once: true });
    window.addEventListener("keydown", desbloquear, { once: true });
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
    };
  }, []);

  useEffect(() => {
    if (!activa) return;

    const contexto = obtenerAudioContext();
    if (!contexto) return;

    contexto.resume().catch(() => {});
    reproducirBeep(contexto);
    intervaloRef.current = setInterval(() => {
      contexto.resume().catch(() => {});
      reproducirBeep(contexto);
    }, 1500);

    return () => {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current);
        intervaloRef.current = null;
      }
    };
  }, [activa]);
}
