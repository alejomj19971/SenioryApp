"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import type { ReactNode } from "react";

// Un fundido con leve subida al entrar (prueba con Motion). Respeta "reducir movimiento": en ese caso se muestra
// directo, sin animar nada.
export function EntradaConMovimiento({ children }: { children: ReactNode }) {
  const prefiereMenosMovimiento = useReducedMotion();
  const transicion: Transition = prefiereMenosMovimiento ? { duration: 0 } : { duration: 0.45, ease: "easeOut" };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={transicion}>
      {children}
    </motion.div>
  );
}
