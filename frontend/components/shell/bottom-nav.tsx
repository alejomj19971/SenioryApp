"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/app", label: "Inicio", icono: Home },
  { href: "/app/cuidadores", label: "Buscar", icono: Search },
  { href: "/app/teleasistencia", label: "Teleasistencia", icono: HeartPulse },
];

export function BottomNav({ hayMedicamentoPendiente = false }: { hayMedicamentoPendiente?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación de la app"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md border-t border-border bg-background/95 backdrop-blur"
    >
      {items.map(({ href, label, icono: Icono }) => {
        const activo =
          href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        const mostrarIndicador = href === "/app/teleasistencia" && hayMedicamentoPendiente;
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              activo ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="relative">
              <Icono className="size-6" aria-hidden="true" />
              {mostrarIndicador && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex size-2.5 rounded-full bg-accent ring-2 ring-background"
                  aria-hidden="true"
                />
              )}
            </span>
            {label}
            {mostrarIndicador && <span className="sr-only">Tienes un medicamento pendiente</span>}
          </Link>
        );
      })}
    </nav>
  );
}
