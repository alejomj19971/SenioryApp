"use client";

import { PantallaDeError } from "@/components/shell/pantalla-de-error";

// Respaldo de la landing y de las pantallas de cuenta (ingresar, registro, legales): no tienen su propio error
// boundary porque no les hace falta uno con un destino distinto. /app, /cuidador y /admin sí tienen el suyo (llevan
// a su propia área, no al inicio). Si el layout raíz mismo falla, lo atrapa `global-error.tsx`, no este archivo.
export default function ErrorGeneral({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PantallaDeError rutaDeInicio="/" etiquetaDeInicio="Ir al inicio" retry={retry} digest={error.digest} />;
}
