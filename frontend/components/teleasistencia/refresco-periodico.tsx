"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// La teleasistencia todavía no tiene flujo en vivo en el backend (pendiente en M6): mientras tanto la pantalla se pone al
// día sola cada cierto tiempo, y solo cuando la persona la está mirando (ni en otra pestaña ni con el celular
// bloqueado). Al volver a la pestaña actualiza de inmediato.
export function RefrescoPeriodico({ cadaSegundos = 15 }: { cadaSegundos?: number }) {
  const enrutador = useRouter();

  useEffect(() => {
    const actualizar = () => {
      if (document.visibilityState === "visible") enrutador.refresh();
    };
    const intervalo = setInterval(actualizar, cadaSegundos * 1000);
    document.addEventListener("visibilitychange", actualizar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", actualizar);
    };
  }, [cadaSegundos, enrutador]);

  return null;
}
