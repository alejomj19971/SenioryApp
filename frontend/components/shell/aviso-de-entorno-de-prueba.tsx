import { FlaskConical } from "lucide-react";

// En el entorno de prueba (staging, donde las personas validan la aplicación) se dice claro, arriba y en todas las pantallas,
// que no es el servicio real: no se cobra dinero ni se atiende a nadie. Se activa con ENTORNO_DE_PRUEBA=true en el servidor.
export function AvisoDeEntornoDePrueba() {
  if (process.env.ENTORNO_DE_PRUEBA !== "true") return null;
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-info px-4 py-2 text-center text-sm font-medium text-info-foreground">
      <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
      <span>Entorno de prueba: aquí no se cobra dinero real ni se atiende a nadie.</span>
    </div>
  );
}
