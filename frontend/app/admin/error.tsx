"use client";

import { PantallaDeError } from "@/components/shell/pantalla-de-error";

export default function ErrorDelPanel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PantallaDeError rutaDeInicio="/admin" etiquetaDeInicio="Ir al panel" retry={retry} digest={error.digest} />;
}
