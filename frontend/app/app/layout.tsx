import { AppHeader } from "@/components/shell/app-header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { obtenerResumen } from "@/lib/services/teleasistencia";

export default async function AppShellLayout({ children }: LayoutProps<"/app">) {
  // La app es de las familias que ya tienen a su persona y su autorización; a las demás, la bienvenida o su área.
  await exigirFamiliaLista();
  // El punto de la barra inferior: ¿hay tomas de hoy sin marcar?
  const resumen = await obtenerResumen();

  return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">
        <AppHeader />
        <BarraAccesibilidad />
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav hayMedicamentoPendiente={resumen.tomas.pendientes > 0} />
      </div>
  );
}
