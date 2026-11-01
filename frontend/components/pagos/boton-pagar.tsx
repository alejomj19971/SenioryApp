"use client";

import { useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { pedirEnlaceDePagoAccion } from "@/lib/acciones/pagos";

// «Pagar ahora»: el servidor pide a la pasarela el enlace del cobro (pedirlo dos veces devuelve el mismo) y se manda
// a la persona allá. La aprobación NO ocurre aquí: solo cuando la pasarela avisa al backend, con su firma.
export function BotonPagar({ pagoId, etiqueta = "Pagar ahora" }: { pagoId: string; etiqueta?: string }) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pagar() {
    empezar(async () => {
      const resultado = await pedirEnlaceDePagoAccion(pagoId);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setError(null);
      window.location.assign(resultado.url);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error !== null && <Aviso titulo="No pudimos abrir el pago" descripcion={error} />}
      <Button type="button" size="lg" className="w-full" onClick={pagar} disabled={pendiente}>
        <CreditCard aria-hidden="true" />
        {pendiente ? "Abriendo el pago…" : etiqueta}
      </Button>
    </div>
  );
}
