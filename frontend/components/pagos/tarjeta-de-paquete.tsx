"use client";

import { useRef, useState, useTransition } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { comprarBolsaAccion } from "@/lib/acciones/pagos";
import { formatearCOP } from "@/lib/format";
import type { PaqueteDeBolsa } from "@/lib/types";

// Un paquete de la bolsa de horas. El precio y el crédito vienen del servidor (de la base de datos); aquí solo se
// dice cuál paquete se quiere. La bolsa se acredita cuando la pasarela confirma el pago, no antes.
export function TarjetaDePaquete({ paquete }: { paquete: PaqueteDeBolsa }) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // La misma compra reintentada (mala conexión, doble toque) usa la misma clave y no se repite.
  const clave = useRef<string | null>(null);

  function comprar() {
    clave.current ??= crypto.randomUUID();
    const miClave = clave.current;
    empezar(async () => {
      const resultado = await comprarBolsaAccion(paquete.codigo, miClave);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setError(null);
      if (resultado.url !== null) window.location.assign(resultado.url);
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border" aria-label={`Paquete de ${paquete.horasReferencia} horas`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-extrabold text-foreground">{paquete.horasReferencia} horas</p>
        {paquete.descuento > 0 && (
          <span className="rounded-full bg-success px-3 py-1 text-sm font-semibold text-success-foreground">{paquete.descuento.toLocaleString("es-CO")} % menos</span>
        )}
      </div>
      <p className="text-base text-muted-foreground">
        Pagas <strong className="text-foreground">{formatearCOP(paquete.precio)}</strong> y recibes{" "}
        <strong className="text-foreground">{formatearCOP(paquete.credito)}</strong> para tus servicios.
      </p>
      {error !== null && <Aviso titulo="No pudimos iniciar la compra" descripcion={error} />}
      <Button type="button" size="lg" onClick={comprar} disabled={pendiente}>
        {pendiente ? "Abriendo el pago…" : "Comprar este paquete"}
      </Button>
    </article>
  );
}
