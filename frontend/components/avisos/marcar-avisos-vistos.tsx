"use client";

import { useEffect } from "react";
import { marcarAvisosVistosAccion } from "@/lib/acciones/avisos";

// Al abrir los avisos, deja constancia (en este dispositivo) de hasta cuál se vio: apaga el punto de la campana.
export function MarcarAvisosVistos({ hasta }: { hasta: string | undefined }) {
  useEffect(() => {
    if (hasta !== undefined) void marcarAvisosVistosAccion(hasta);
  }, [hasta]);
  return null;
}
