"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Siren } from "lucide-react";

// «Pedir ayuda» (H7) tiene que ser lógico de encontrar sin importar en qué pantalla esté la familia: no solo
// dentro de Teleasistencia. Este botón flotante vive en el shell de `/app` y manda directo al mismo flujo que ya
// usa el comando de voz (`?alerta=1`, ver `boton-alerta.tsx`): llega a la cuenta regresiva en un solo toque, sin
// duplicar el envío de la alerta. Se oculta en Teleasistencia porque ahí ya está el botón grande.
export function BotonFlotanteDeAyuda() {
  const pathname = usePathname();
  if (pathname.startsWith("/app/teleasistencia")) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 mx-auto flex w-full max-w-md justify-end px-4">
      <Link
        href="/app/teleasistencia?alerta=1"
        aria-label="Pedir ayuda ahora"
        className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform active:scale-95"
      >
        <Siren className="size-7" aria-hidden="true" />
      </Link>
    </div>
  );
}
