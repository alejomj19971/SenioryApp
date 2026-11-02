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
        <Link
          href="/registro/cuidador"
          className="inline-flex min-h-12 items-center text-sm font-semibold text-primary hover:underline"
        >
          ¿Eres cuidador? Postúlate
        </Link>
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-6 text-sm text-muted-foreground">
          <Link href="/privacidad" className="inline-flex min-h-12 items-center underline-offset-4 hover:underline">
            Política de tratamiento de datos
          </Link>
          <Link href="/terminos" className="inline-flex min-h-12 items-center underline-offset-4 hover:underline">
            Términos y condiciones
          </Link>
          <Link href="/alcance-teleasistencia" className="inline-flex min-h-12 items-center underline-offset-4 hover:underline">
            Alcance de la teleasistencia
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Seniory. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
