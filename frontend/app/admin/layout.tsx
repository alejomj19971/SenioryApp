import Link from "next/link";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { Logo } from "@/components/logo";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";

// El panel de los revisores (F9). Se usa en computador: un ancho cómodo para leer una cola de verificaciones.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link href="/admin" aria-label="Ir al inicio del panel de revisión">
          <Logo />
        </Link>
        <SalirDeLaCuenta compacto />
      </header>
      <BarraAccesibilidad />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
