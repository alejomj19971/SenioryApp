"use client";

import { PantallaDeError } from "@/components/shell/pantalla-de-error";

export default function ErrorDeLaApp({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PantallaDeError rutaDeInicio="/app" etiquetaDeInicio="Ir al inicio" retry={retry} digest={error.digest} />;
}
