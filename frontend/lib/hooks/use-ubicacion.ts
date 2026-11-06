"use client";

import { useCallback, useState } from "react";

// Envuelve la Geolocation API del navegador. Nunca guarda la coordenada: cada llamada a `obtenerUbicacion` es una
// lectura efímera, igual con la que busca una familia que con la que un cuidador ubica su pin (ambas pantallas
// la usan). El código de error es un número estándar del navegador (no hay una constante exportada que se pueda
// importar de forma fiable entre entornos).
const PERMISO_DENEGADO = 1;
const POSICION_NO_DISPONIBLE = 2;
const TIEMPO_AGOTADO = 3;
const TIEMPO_MAXIMO_MS = 10_000;

export interface Coordenada {
  latitud: number;
  longitud: number;
}

export type ResultadoDeUbicacion = { ok: true; datos: Coordenada } | { ok: false; mensaje: string };

function mensajeDeError(codigo: number): string {
  switch (codigo) {
    case PERMISO_DENEGADO:
      return "Activa el permiso de ubicación en tu navegador para usar esto.";
    case POSICION_NO_DISPONIBLE:
      return "No pudimos encontrar tu ubicación. Inténtalo de nuevo.";
    case TIEMPO_AGOTADO:
      return "Tardamos demasiado en encontrar tu ubicación. Inténtalo de nuevo.";
    default:
      return "No pudimos obtener tu ubicación.";
  }
}

export function useUbicacionDelNavegador() {
  const [obteniendo, setObteniendo] = useState(false);

  const obtenerUbicacion = useCallback((): Promise<ResultadoDeUbicacion> => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve({ ok: false, mensaje: "Tu navegador no permite compartir tu ubicación." });
        return;
      }
      setObteniendo(true);
      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          setObteniendo(false);
          resolve({ ok: true, datos: { latitud: posicion.coords.latitude, longitud: posicion.coords.longitude } });
        },
        (error) => {
          setObteniendo(false);
          resolve({ ok: false, mensaje: mensajeDeError(error.code) });
        },
        { enableHighAccuracy: true, timeout: TIEMPO_MAXIMO_MS, maximumAge: 0 },
      );
    });
  }, []);

  return { obteniendo, obtenerUbicacion };
}
