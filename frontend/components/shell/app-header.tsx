import Link from "next/link";
import { Logo } from "@/components/logo";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link href="/app" aria-label="Ir al inicio de la app">
        <Logo />
      </Link>
    </header>
  );
}
