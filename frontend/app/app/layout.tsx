import { AppHeader } from "@/components/shell/app-header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { ContratacionProvider } from "@/components/contratacion/contratacion-provider";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { obtenerProximoMedicamento } from "@/lib/services/teleasistencia";

export default async function AppShellLayout({ children }: LayoutProps<"/app">) {
  const proximoMedicamento = await obtenerProximoMedicamento();

  return (
    <ContratacionProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">
        <AppHeader />
        <BarraAccesibilidad />
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav hayMedicamentoPendiente={proximoMedicamento !== null} />
      </div>
    </ContratacionProvider>
  );
}
