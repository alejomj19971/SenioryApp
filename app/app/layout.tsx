import { AppHeader } from "@/components/shell/app-header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { ContratacionProvider } from "@/components/contratacion/contratacion-provider";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";

export default function AppShellLayout({ children }: LayoutProps<"/app">) {
  return (
    <ContratacionProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">
        <AppHeader />
        <BarraAccesibilidad />
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav />
      </div>
    </ContratacionProvider>
  );
}
