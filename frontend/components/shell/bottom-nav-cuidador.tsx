"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, CalendarClock, Home, MessageCircle, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/cuidador", label: "Inicio", icono: Home },
  { href: "/cuidador/horario", label: "Horario", icono: CalendarClock },
  { href: "/cuidador/liquidaciones", label: "Pagos", icono: Banknote },
  { href: "/cuidador/mensajes", label: "Mensajes", icono: MessageCircle },
  { href: "/cuidador/perfil", label: "Perfil", icono: UserRound },
];

// La misma idea que la barra inferior de la familia (`BottomNav`): en el celular, todo en una sola pantalla
// larga es difícil de navegar. El cuidador también la necesita.
export function BottomNavCuidador() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación de tu panel"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md border-t border-border bg-background/95 backdrop-blur"
    >
      {items.map(({ href, label, icono: Icono }) => {
        const activo = href === "/cuidador" ? pathname === "/cuidador" : pathname.startsWith(href);
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
            <Icono className="size-6" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
