import Link from "next/link";
import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center sm:px-6">
        <Logo />
        <p className="max-w-md text-sm text-muted-foreground">
          Marketplace de cuidado para adultos mayores en Colombia. Piloto en
          Medellín.
        </p>
        <Link
          href="/app"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Probar la app
        </Link>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Seniory. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
