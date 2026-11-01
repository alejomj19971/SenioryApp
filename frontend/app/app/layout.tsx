import { AppHeader } from "@/components/shell/app-header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { hayAvisosNuevos as hayAvisosNuevosParaMi } from "@/lib/services/notificaciones";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { obtenerResumen } from "@/lib/services/teleasistencia";

export default async function AppShellLayout({ children }: LayoutProps<"/app">) {
  // La app es de las familias que ya tienen a su persona y su autorización; a las demás, la bienvenida o su área.
  await exigirFamiliaLista();
  // El punto de la barra inferior: ¿hay tomas de hoy sin marcar?
  // …y el punto de la campana: ¿hay avisos que no ha visto en este dispositivo?
  const [resumen, hayAvisosNuevos] = await Promise.all([obtenerResumen(), hayAvisosNuevosParaMi()]);

  return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">
        <AppHeader hayAvisosNuevos={hayAvisosNuevos} />
        <BarraAccesibilidad />
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav hayMedicamentoPendiente={resumen.tomas.pendientes > 0} />
      </div>
  );
}
