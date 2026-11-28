import { AppHeader } from "@/components/shell/app-header";
import { BotonFlotanteDeAyuda } from "@/components/shell/boton-flotante-de-ayuda";
import { BottomNav } from "@/components/shell/bottom-nav";
import { BarraAccesibilidad } from "@/components/accesibilidad/barra-accesibilidad";
import { AvisoDeCorreo } from "@/components/cuenta/aviso-de-correo";
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
        <AvisoDeCorreo />
        {/* pb-52: dentro de la barra de navegación (64px) hay que caber también el botón flotante de ayuda
            (que llega hasta 176px desde abajo cuando no hay una barra de acción propia, ver boton-flotante-de-ayuda.tsx),
            para que el contenido normal de una pantalla corta (como Inicio) no le quede debajo. */}
        <main className="flex-1 pb-52">{children}</main>
        <BotonFlotanteDeAyuda />
        <BottomNav hayMedicamentoPendiente={resumen.tomas.pendientes > 0} />
      </div>
  );
}
