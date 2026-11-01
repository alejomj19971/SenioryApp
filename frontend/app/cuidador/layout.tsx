import Link from "next/link";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { Campana } from "@/components/avisos/campana";
import { Logo } from "@/components/logo";
import { hayAvisosNuevos as hayAvisosNuevosParaMi } from "@/lib/services/notificaciones";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";

// El área del cuidador: sus solicitudes y servicios. Pensada para el celular y para usarse con prisa.
export default async function CuidadorLayout({ children }: LayoutProps<"/cuidador">) {
  const hayAvisosNuevos = await hayAvisosNuevosParaMi();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link href="/cuidador" aria-label="Ir al inicio de tu panel">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Campana base="/cuidador" hayNuevos={hayAvisosNuevos} />
          <SalirDeLaCuenta compacto />
        </div>
      </header>
      <BarraAccesibilidad />
      <main className="flex-1 pb-10">{children}</main>
    </div>
  );
}
