"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Cada cuánto se vuelve a preguntar si el pago ya quedó aprobado, y cuánto se espera antes de decir que tarda más de lo normal.
const CADA_MS = 2_000;
const HASTA_MS = 40_000;

// La pasarela avisa al backend cuando el pago se aprueba, y ese aviso puede tardar unos segundos. Mientras tanto, la persona ve
// que estamos verificando; la pantalla vuelve a pedirle el estado al servidor (que es quien sabe) hasta que cambie.
export function EsperandoElPago({ servicioId }: { servicioId: string | null }) {
  const router = useRouter();
  const [tarda, setTarda] = useState(false);

  useEffect(() => {
    const inicio = Date.now();
    const intervalo = setInterval(() => {
      if (Date.now() - inicio >= HASTA_MS) {
        clearInterval(intervalo);
        setTarda(true);
        return;
      }
      router.refresh();
    }, CADA_MS);
    return () => clearInterval(intervalo);
  }, [router]);

  const destino = servicioId === null ? "/app/bolsa" : `/app/servicios/${servicioId}`;

  if (tarda) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-lg font-semibold text-foreground">Tu pago está tardando más de lo normal</p>
        <p className="text-base text-muted-foreground">No te preocupes: no se cobra dos veces. Revisa en unos minutos el estado desde tu servicio.</p>
        <Link href={destino} className="inline-flex min-h-12 w-fit items-center font-medium text-primary underline underline-offset-4">
          Ver mi servicio
        </Link>
      </div>
    );
  }

  return (
    <div role="status" className="flex flex-col items-center gap-4 py-6 text-center">
      <Loader2 className="size-10 animate-spin text-primary" aria-hidden="true" />
      <p className="text-lg font-semibold text-foreground">Estamos verificando tu pago</p>
      <p className="text-base text-muted-foreground">Dura unos segundos. No cierres esta pantalla.</p>
    </div>
  );
}
