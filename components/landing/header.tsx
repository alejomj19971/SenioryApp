import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

const enlaces = [
  { href: "#servicios", label: "Servicios" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#precios", label: "Precios" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Ir al inicio de Seniory">
          <Logo />
        </Link>
        <nav aria-label="Navegación principal" className="hidden items-center gap-8 md:flex">
          {enlaces.map((enlace) => (
            <a
              key={enlace.href}
              href={enlace.href}
              className="text-base font-medium text-foreground/80 transition-colors hover:text-primary"
            >
              {enlace.label}
            </a>
          ))}
        </nav>
        <Link
          href="/app"
          className={buttonVariants({
            size: "lg",
            className: "h-12 rounded-full px-5 text-base",
          })}
        >
          Probar la app
        </Link>
      </div>
    </header>
  );
}
