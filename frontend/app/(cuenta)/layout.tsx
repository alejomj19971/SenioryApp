import Link from "next/link";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { Logo } from "@/components/logo";

// Las pantallas de cuenta (ingresar, registro, recuperar, bienvenida, política): logo y contenido centrado, con la
// barra de accesibilidad a mano porque quien más la necesita llega aquí antes de entrar a la app.
export default function CuentaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <BarraAccesibilidad />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
        <Link href="/" aria-label="Ir al inicio de Seniory" className="self-center">
          <Logo />
        </Link>
        <main className="mt-8 flex-1">{children}</main>
        <footer className="mt-10 flex flex-wrap justify-center gap-x-6 text-sm text-muted-foreground">
          <Link href="/privacidad" className="inline-flex min-h-12 items-center underline underline-offset-4">
            Política de tratamiento de datos
          </Link>
        </footer>
      </div>
    </div>
  );
}
