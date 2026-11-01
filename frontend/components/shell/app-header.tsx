import Link from "next/link";
import { MessageCircle, UserRound } from "lucide-react";
import { Campana } from "@/components/avisos/campana";
import { Logo } from "@/components/logo";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";
import { buttonVariants } from "@/components/ui/button";

export function AppHeader({ hayAvisosNuevos = false }: { hayAvisosNuevos?: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link href="/app" aria-label="Ir al inicio de la app">
        {/* Solo el ícono: con la campana, los mensajes, la cuenta y «Salir», el nombre no cabe en un celular de 412 px. */}
        <Logo iconOnly />
      </Link>
      <div className="flex items-center gap-2">
        <Campana base="/app" hayNuevos={hayAvisosNuevos} />
        <Link
          href="/app/mensajes"
          aria-label="Mensajes"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <MessageCircle aria-hidden="true" />
        </Link>
        <Link
          href="/app/cuenta"
          aria-label="Mi cuenta"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <UserRound aria-hidden="true" />
        </Link>
        <SalirDeLaCuenta compacto />
      </div>
    </header>
  );
}
