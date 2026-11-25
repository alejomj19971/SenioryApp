"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Cuidadores", icono: Users, activoEn: ["/admin/cuidadores"] },
  { href: "/admin/revision", label: "Verificaciones", icono: ClipboardCheck, activoEn: [] },
  { href: "/admin/seguridad", label: "Seguridad", icono: Lock, activoEn: [] },
] as const;

// La navegación del panel del administrador. Una sola barra que se adapta: en el celular es una barra inferior fija (el
// pulgar la alcanza, como la de la familia y la del cuidador) y en pantallas grandes pasa a ser una fila de pestañas bajo
// el encabezado. «Cuidadores» también está activa dentro del expediente de un cuidador, que se abre desde esa lista.
export function NavAdmin() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación del panel"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 backdrop-blur md:static md:mx-auto md:w-full md:max-w-4xl md:gap-1 md:border-t-0 md:border-b md:bg-transparent md:px-4 md:backdrop-blur-none"
    >
      {items.map(({ href, label, icono: Icono, activoEn }) => {
        const activo = href === "/admin" ? pathname === "/admin" || activoEn.some((ruta) => pathname.startsWith(ruta)) : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              "md:-mb-px md:min-h-0 md:flex-none md:flex-row md:gap-2 md:border-b-2 md:px-4 md:py-3 md:text-base",
              activo ? "text-primary md:border-primary" : "text-muted-foreground hover:text-foreground md:border-transparent",
            )}
          >
            <Icono className="size-6 md:size-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
