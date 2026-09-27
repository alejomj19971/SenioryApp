"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type NivelContraste = "normal" | "alto";
export type TamanoTexto = "normal" | "grande" | "muy-grande";

const ESCALA_POR_TAMANO: Record<TamanoTexto, string> = {
  normal: "1",
  grande: "1.15",
  "muy-grande": "1.3",
};

const CLAVE_ALMACENAMIENTO = "seniory:accesibilidad";

interface AccesibilidadContextValor {
  contraste: NivelContraste;
  tamanoTexto: TamanoTexto;
  alternarContraste: () => void;
  setTamanoTexto: (valor: TamanoTexto) => void;
}

const AccesibilidadContext = createContext<AccesibilidadContextValor | null>(null);

function leerPreferenciasGuardadas(): { contraste: NivelContraste; tamanoTexto: TamanoTexto } | null {
  try {
    const guardado = window.localStorage.getItem(CLAVE_ALMACENAMIENTO);
    if (!guardado) return null;
    return JSON.parse(guardado);
  } catch {
    return null;
  }
}

export function AccesibilidadProvider({ children }: { children: ReactNode }) {
  const [contraste, setContraste] = useState<NivelContraste>("normal");
  const [tamanoTexto, setTamanoTexto] = useState<TamanoTexto>("normal");

  useEffect(() => {
    // Sincroniza con localStorage (sistema externo) solo una vez, tras montar en el cliente.
    const preferencias = leerPreferenciasGuardadas();
    if (preferencias) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContraste(preferencias.contraste);
      setTamanoTexto(preferencias.tamanoTexto);
    }
  }, []);

  useEffect(() => {
    const raiz = document.documentElement;
    if (contraste === "alto") {
      raiz.setAttribute("data-contrast", "high");
    } else {
      raiz.removeAttribute("data-contrast");
    }
    raiz.style.setProperty("--escala-texto", ESCALA_POR_TAMANO[tamanoTexto]);

    try {
      window.localStorage.setItem(
        CLAVE_ALMACENAMIENTO,
        JSON.stringify({ contraste, tamanoTexto }),
      );
    } catch {
      // localStorage no disponible: la preferencia solo dura la sesión actual
    }
  }, [contraste, tamanoTexto]);

  const valor = useMemo(
    () => ({
      contraste,
      tamanoTexto,
      alternarContraste: () =>
        setContraste((actual) => (actual === "normal" ? "alto" : "normal")),
      setTamanoTexto,
    }),
    [contraste, tamanoTexto],
  );

  return (
    <AccesibilidadContext.Provider value={valor}>
      {children}
    </AccesibilidadContext.Provider>
  );
}

export function useAccesibilidad() {
  const contexto = useContext(AccesibilidadContext);
  if (!contexto) {
    throw new Error("useAccesibilidad debe usarse dentro de AccesibilidadProvider");
  }
  return contexto;
}
