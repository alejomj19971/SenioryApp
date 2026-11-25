import Link from "next/link";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { id: "cuidadores", nombre: "Cuidadores", ruta: "/admin" },
  { id: "verificaciones", nombre: "Verificaciones", ruta: "/admin/revision" },
] as const;

export type PestanaDelPanel = (typeof PESTANAS)[number]["id"];

// Las dos secciones del panel del administrador. «Cuidadores» es la de inicio.
export function PestanasDelPanel({ activa }: { activa: PestanaDelPanel }) {
  return (
    <nav aria-label="Secciones del panel" className="flex gap-1 border-b border-border">
      {PESTANAS.map(({ id, nombre, ruta }) => (
        <Link
          key={id}
          href={ruta}
          aria-current={id === activa ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-base font-medium transition-colors",
            id === activa ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {nombre}
        </Link>
      ))}
    </nav>
  );
}
