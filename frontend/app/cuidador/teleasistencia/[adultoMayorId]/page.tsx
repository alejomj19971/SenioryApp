import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, HeartPulse, TriangleAlert } from "lucide-react";
import { BotonAlerta } from "@/components/teleasistencia/boton-alerta";
import { GraficaSignos } from "@/components/teleasistencia/grafica-signos";
import { RegistrarLectura } from "@/components/teleasistencia/formulario-lectura";
import { ListaMedicamentos } from "@/components/teleasistencia/lista-medicamentos";
import { RefrescoPeriodico } from "@/components/teleasistencia/refresco-periodico";
import { enviarAlertaDelCuidadorAccion, registrarLecturaDelCuidadorAccion } from "@/lib/acciones/teleasistencia";
import { formatearFechaHora } from "@/lib/format";
import { exigirRol } from "@/lib/sesion";
import { listarLecturasDelCuidador, listarMedicamentosDeHoyDelCuidador, obtenerResumenDelCuidador } from "@/lib/services/teleasistencia";

export const metadata = {
  title: "Teleasistencia",
};

// Lo mismo que ve la familia en `/app/teleasistencia`, para el cuidador: solo mientras tiene un servicio activo con
// esa persona (en curso, o aceptado y dentro de su franja) — el backend lo verifica en CADA consulta de esta
// pantalla, así que si el servicio ya terminó o se canceló, esto se ve igual que una página que no existe. Nunca
// puede agregar ni desactivar un medicamento (eso es solo de la familia): por eso no se pasa `rutaDeAdministracion`.
export default async function TeleasistenciaDelCuidadorPage({ params, searchParams }: PageProps<"/cuidador/teleasistencia/[adultoMayorId]">) {
  const { adultoMayorId } = await params;
  const { nombre, edad } = await searchParams;
  await exigirRol("cuidador");
  const nombreDeLaPersona = typeof nombre === "string" && nombre !== "" ? nombre : "la persona a cuidar";
  const edadDeLaPersona = typeof edad === "string" && edad !== "" ? edad : null;

  const [medicamentos, lecturas, resumen] = await Promise.all([
    listarMedicamentosDeHoyDelCuidador(adultoMayorId),
    listarLecturasDelCuidador(adultoMayorId),
    obtenerResumenDelCuidador(adultoMayorId),
  ]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      {/* La pantalla se pone al día sola mientras se mira: el backend aún no tiene flujo en vivo. */}
      <RefrescoPeriodico />

      <Link href="/cuidador" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tu panel
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {nombreDeLaPersona}
          {edadDeLaPersona !== null ? `, ${edadDeLaPersona} años` : ""}
        </h1>
        {resumen.ultimaLectura !== null && (
          <p className="mt-1 text-base text-muted-foreground">Última lectura: {formatearFechaHora(resumen.ultimaLectura.fecha)}</p>
        )}
      </div>

      {resumen.alertasSinAtender > 0 && (
        <p role="note" className="flex items-start gap-2 rounded-2xl border border-destructive bg-destructive/5 p-4 text-base text-foreground">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            Hay {resumen.alertasSinAtender === 1 ? "una alerta de ayuda" : `${resumen.alertasSinAtender} alertas de ayuda`} sin atender.
          </span>
        </p>
      )}

      <Suspense fallback={<div className="min-h-24 w-full animate-pulse rounded-2xl bg-muted" />}>
        <BotonAlerta nombreDeLaPersona={nombreDeLaPersona} accion={enviarAlertaDelCuidadorAccion.bind(null, adultoMayorId)} />
      </Suspense>

      <div className="h-px bg-border" aria-hidden="true" />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Medicamentos de hoy</h2>
        <ListaMedicamentos tomas={medicamentos.tomas} rutaDeAdministracion={null} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <HeartPulse className="size-5 text-primary" aria-hidden="true" />
          Signos vitales
        </h2>
        <GraficaSignos lecturas={lecturas} />
        <RegistrarLectura accion={registrarLecturaDelCuidadorAccion.bind(null, adultoMayorId)} />
      </section>
    </div>
  );
}
