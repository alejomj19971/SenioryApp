"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Campo, type CampoProps } from "@/components/cuenta/campo";
import { Button } from "@/components/ui/button";

// Un campo de contraseña con botón para mostrarla u ocultarla (`aria-pressed`). Quien escribe en el celular se
// equivoca mucho con las contraseñas largas: poder verla evita intentos fallidos.
export function CampoDeContrasena({ etiqueta, ...resto }: Omit<CampoProps, "type" | "accion">) {
  const [visible, setVisible] = useState(false);
  return (
    <Campo
      {...resto}
      etiqueta={etiqueta}
      icono={Lock}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      accion={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={visible}
          aria-label={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
          onClick={() => setVisible((actual) => !actual)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      }
    />
  );
}
