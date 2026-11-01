import Link from "next/link";
import { Bell } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// La campana del encabezado: lleva a los avisos. El punto dice que hay alguno que esta persona aún no ha visto EN ESTE
// dispositivo (el servidor no guarda «leído»); no cuenta cuántos.
export function Campana({ base, hayNuevos }: { base: "/app" | "/cuidador"; hayNuevos: boolean }) {
  return (
    <Link href={`${base}/avisos`} aria-label={hayNuevos ? "Avisos: tienes avisos nuevos" : "Avisos"} className={buttonVariants({ variant: "ghost", size: "icon" })}>
      <span className="relative">
        <Bell aria-hidden="true" />
        {hayNuevos && <span className="absolute -top-0.5 -right-0.5 flex size-2.5 rounded-full bg-accent ring-2 ring-background" aria-hidden="true" />}
      </span>
    </Link>
  );
}
