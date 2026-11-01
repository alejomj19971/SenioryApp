import Link from "next/link";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { Logo } from "@/components/logo";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";

// El área del cuidador: sus solicitudes y servicios. Pensada para el celular y para usarse con prisa.
export default function CuidadorLayout({ children }: LayoutProps<"/cuidador">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link href="/cuidador" aria-label="Ir al inicio de tu panel">
          <Logo />
        </Link>
        <SalirDeLaCuenta compacto />
      </header>
      <BarraAccesibilidad />
      <main className="flex-1 pb-10">{children}</main>
    </div>
  );
}
