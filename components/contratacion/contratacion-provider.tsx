"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ContratacionConfirmada } from "@/lib/services/contratacion";

interface ContratacionContextValor {
  contratacionActual: ContratacionConfirmada | null;
  setContratacionActual: (contratacion: ContratacionConfirmada) => void;
}

const ContratacionContext = createContext<ContratacionContextValor | null>(null);

export function ContratacionProvider({ children }: { children: ReactNode }) {
  const [contratacionActual, setContratacionActual] =
    useState<ContratacionConfirmada | null>(null);

  const valor = useMemo(
    () => ({ contratacionActual, setContratacionActual }),
    [contratacionActual],
  );

  return (
    <ContratacionContext.Provider value={valor}>
      {children}
    </ContratacionContext.Provider>
  );
}

export function useContratacion() {
  const contexto = useContext(ContratacionContext);
  if (!contexto) {
    throw new Error("useContratacion debe usarse dentro de ContratacionProvider");
  }
  return contexto;
}
