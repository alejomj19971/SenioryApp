import Link from "next/link";
import { UserRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";
import { buttonVariants } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link href="/app" aria-label="Ir al inicio de la app">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
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
