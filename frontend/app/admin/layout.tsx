import Link from "next/link";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { Logo } from "@/components/logo";
import { NavAdmin } from "@/components/shell/nav-admin";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";

// El panel de los administradores: cuidadores, verificaciones y la seguridad de la cuenta. Se adapta: en el celular, la
// navegación es una barra inferior (con espacio reservado para que no tape el contenido); en el computador, pestañas bajo
// el encabezado y un ancho cómodo para leer.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link href="/admin" aria-label="Ir al inicio del panel del administrador">
          <Logo />
        </Link>
        <SalirDeLaCuenta compacto />
      </header>
      <BarraAccesibilidad />
      <NavAdmin />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-28 md:py-8">{children}</main>
    </div>
  );
}
