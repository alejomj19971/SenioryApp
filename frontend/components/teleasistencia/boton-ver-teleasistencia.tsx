import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Lleva a la pantalla de teleasistencia de esa persona (medicamentos, signos, alerta) mientras el servicio está
// activo con ella — el backend lo verifica en cada consulta; nombre y edad solo son para el encabezado, no hace
// falta pedirlos aparte.
export function BotonVerTeleasistencia({ adultoMayor }: { adultoMayor: { id: string; nombre: string; edad: number } }) {
  return (
    <Link
      href={`/cuidador/teleasistencia/${adultoMayor.id}?nombre=${encodeURIComponent(adultoMayor.nombre)}&edad=${adultoMayor.edad}`}
      className={buttonVariants({ variant: "outline", className: "w-full" })}
    >
      <HeartPulse aria-hidden="true" />
      Ver teleasistencia de {adultoMayor.nombre.split(" ")[0]}
    </Link>
  );
}
