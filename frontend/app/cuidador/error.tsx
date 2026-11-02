"use client";

import { PantallaDeError } from "@/components/shell/pantalla-de-error";

export default function ErrorDelCuidador({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PantallaDeError rutaDeInicio="/cuidador" etiquetaDeInicio="Ir a tu panel" retry={retry} digest={error.digest} />;
}
