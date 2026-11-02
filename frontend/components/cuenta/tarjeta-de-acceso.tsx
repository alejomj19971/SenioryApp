import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Una superficie alzada y suave para ingresar o registrarse, en vez de los campos sueltos sobre el fondo (acento de
// claymorfismo, sutil a propósito). El borde (`ring-border`) nunca desaparece: la sombra solo se le suma, no lo
// reemplaza, y se apaga del todo en alto contraste (ver `.tarjeta-de-acceso` en globals.css).
export function TarjetaDeAcceso({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("tarjeta-de-acceso flex flex-col gap-6 rounded-3xl bg-card p-6 ring-1 ring-border/70 sm:p-8", className)}>{children}</div>;
}
