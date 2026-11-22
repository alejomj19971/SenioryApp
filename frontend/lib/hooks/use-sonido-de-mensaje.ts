"use client";

import { useCallback, useEffect } from "react";

let audioContextCompartido: AudioContext | null = null;

function obtenerAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  if (!audioContextCompartido) {
    audioContextCompartido = new AudioContext();
  }
  return audioContextCompartido;
}

function reproducirPing(contexto: AudioContext) {
  const inicio = contexto.currentTime;
  const oscilador = contexto.createOscillator();
  const ganancia = contexto.createGain();
  oscilador.type = "sine";
  oscilador.frequency.value = 740;
  ganancia.gain.setValueAtTime(0, inicio);
  ganancia.gain.linearRampToValueAtTime(0.2, inicio + 0.02);
  ganancia.gain.linearRampToValueAtTime(0, inicio + 0.18);
  oscilador.connect(ganancia);
  ganancia.connect(contexto.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + 0.2);
}

/**
 * Un sonido corto para avisar que llegó un mensaje nuevo mientras se tiene el chat abierto. Igual que
 * `useAlarmaSonido`, necesita que el navegador ya haya recibido una interacción (click/tecla) en la página,
 * por las políticas de autoplay — por eso se "desbloquea" el AudioContext en el primer gesto.
 */
export function useSonidoDeMensaje(): () => void {
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

  return useCallback(() => {
    const contexto = obtenerAudioContext();
    if (!contexto) return;
    contexto.resume().catch(() => {});
    reproducirPing(contexto);
  }, []);
}
