"use client";

import { useEffect, useRef, useState } from "react";
import { cotizarServicio } from "@/lib/acciones/servicios";
import type { Cotizacion } from "@/lib/types";

// La cotización del servidor para un cuidador y un número de horas: cada cambio de horas pide una nueva
// (el precio nunca lo calcula el navegador). `cotizacionInicial` es la que ya trajo el servidor al abrir la
// pantalla (para 1 hora); si cambian las horas, se pide la primera cotización en vivo.
export function useCotizacion(cuidadorId: string, horas: number, cotizacionInicial: Cotizacion | null) {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(cotizacionInicial);
  const [cotizando, setCotizando] = useState(false);
  const [errorDeCotizacion, setErrorDeCotizacion] = useState<string | null>(
    cotizacionInicial === null ? "No pudimos calcular el precio. Inténtalo de nuevo." : null,
  );
  const [intento, setIntento] = useState(0);
  const turno = useRef(0);
  const primeraVez = useRef(true);

  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      if (cotizacionInicial !== null) return;
    }
    const miTurno = ++turno.current;
    setCotizando(true);
    void cotizarServicio(cuidadorId, horas).then((resultado) => {
      // Si ya cambiaron las horas otra vez, esta respuesta quedó vieja.
      if (miTurno !== turno.current) return;
      setCotizando(false);
      if (resultado.ok) {
        setCotizacion(resultado.cotizacion);
        setErrorDeCotizacion(null);
      } else {
        setErrorDeCotizacion(resultado.mensaje);
      }
    });
  }, [cuidadorId, horas, cotizacionInicial, intento]);

  return { cotizacion, cotizando, errorDeCotizacion, reintentar: () => setIntento((actual) => actual + 1) };
}
