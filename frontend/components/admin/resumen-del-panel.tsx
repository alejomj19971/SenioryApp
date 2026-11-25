import { Star } from "lucide-react";
import { etiquetaEspecialidad } from "@/lib/format";
import type { EstadisticasDeCuidadores, EstadisticasDeServicios } from "@/lib/services/estadisticas";

const ESTADOS_DE_SERVICIO: { estado: keyof EstadisticasDeServicios["porEstado"]; nombre: string }[] = [
  { estado: "solicitado", nombre: "Solicitados" },
  { estado: "aceptado", nombre: "Aceptados" },
  { estado: "en_curso", nombre: "En curso" },
  { estado: "finalizado", nombre: "Finalizados" },
  { estado: "cancelado", nombre: "Cancelados" },
];

const ESTADOS_DE_CUIDADOR: { estado: keyof EstadisticasDeCuidadores["porEstado"]; nombre: string }[] = [
  { estado: "activo", nombre: "Activos" },
  { estado: "en_revision", nombre: "En revisión" },
  { estado: "borrador", nombre: "En borrador" },
  { estado: "suspendido", nombre: "Suspendidos" },
];

const ESPECIALIDADES: (keyof EstadisticasDeCuidadores["visiblesPorEspecialidad"])[] = ["auxiliar", "enfermeria", "fisioterapia", "acompanamiento"];

const formatoDeNumero = new Intl.NumberFormat("es-CO");

function Cifra({ valor, nombre, destacada = false }: { valor: number | string; nombre: string; destacada?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{nombre}</dt>
      <dd className={destacada ? "text-3xl font-bold text-foreground" : "text-xl font-semibold text-foreground"}>
        {typeof valor === "number" ? formatoDeNumero.format(valor) : valor}
      </dd>
    </div>
  );
}

// Una fila por categoría con una barra proporcional al total: se lee de un vistazo sin necesidad de una librería de gráficos.
function Distribucion({ titulo, filas, total }: { titulo: string; filas: { nombre: string; cantidad: number }[]; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      <ul className="flex flex-col gap-2">
        {filas.map(({ nombre, cantidad }) => (
          <li key={nombre} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{nombre}</span>
              <span className="font-medium text-foreground">{formatoDeNumero.format(cantidad)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${total === 0 ? 0 : Math.round((cantidad / total) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// El resumen de arriba del panel de administración: cómo van los servicios y cuántos cuidadores hay. Solo conteos, nunca
// datos de una persona. Si alguno de los dos no se pudo leer llega `null` y se avisa en esa tarjeta, sin tumbar la cola
// de revisión que está debajo.
export function ResumenDelPanel({ servicios, cuidadores }: { servicios: EstadisticasDeServicios | null; cuidadores: EstadisticasDeCuidadores | null }) {
  return (
    <section aria-labelledby="resumen" className="flex flex-col gap-4">
      <h2 id="resumen" className="text-lg font-semibold text-foreground">
        Resumen
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <article aria-labelledby="resumen-servicios" className="flex flex-col gap-5 rounded-2xl bg-card p-5 ring-1 ring-border">
          <h3 id="resumen-servicios" className="text-base font-semibold text-foreground">
            Servicios
          </h3>
          {servicios === null ? (
            <p className="text-sm text-muted-foreground">No pudimos cargar los servicios. Recarga la página para intentarlo de nuevo.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4">
                <Cifra valor={servicios.total} nombre="En total" destacada />
                <Cifra valor={servicios.porEstado.en_curso} nombre="En curso ahora" destacada />
                <Cifra valor={servicios.solicitadosUltimos7Dias} nombre="Pedidos en 7 días" />
                <Cifra valor={servicios.solicitadosUltimos30Dias} nombre="Pedidos en 30 días" />
                <Cifra valor={servicios.horasAtendidas} nombre="Horas atendidas" />
              </dl>
              <Distribucion
                titulo="Por estado"
                total={servicios.total}
                filas={ESTADOS_DE_SERVICIO.map(({ estado, nombre }) => ({ nombre, cantidad: servicios.porEstado[estado] }))}
              />
            </>
          )}
        </article>

        <article aria-labelledby="resumen-cuidadores" className="flex flex-col gap-5 rounded-2xl bg-card p-5 ring-1 ring-border">
          <h3 id="resumen-cuidadores" className="text-base font-semibold text-foreground">
            Cuidadores
          </h3>
          {cuidadores === null ? (
            <p className="text-sm text-muted-foreground">No pudimos cargar los cuidadores. Recarga la página para intentarlo de nuevo.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4">
                <Cifra valor={cuidadores.total} nombre="Registrados" destacada />
                <Cifra valor={cuidadores.visibles} nombre="Visibles para familias" destacada />
                <Cifra valor={cuidadores.verificacionesPendientes} nombre="Verificaciones por revisar" />
                <Cifra valor={cuidadores.serviciosCompletados} nombre="Servicios completados" />
                <div className="flex flex-col gap-0.5">
                  <dt className="text-sm text-muted-foreground">Calificación promedio</dt>
                  <dd className="flex items-center gap-1 text-xl font-semibold text-foreground">
                    {cuidadores.calificacionPromedio === null ? (
                      <span className="text-base font-normal text-muted-foreground">Sin reseñas</span>
                    ) : (
                      <>
                        <Star className="size-5 fill-warning text-warning" aria-hidden="true" />
                        {cuidadores.calificacionPromedio.toFixed(1)}
                        <span className="text-sm font-normal text-muted-foreground">({formatoDeNumero.format(cuidadores.totalDeResenas)})</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
              <Distribucion
                titulo="Por estado"
                total={cuidadores.total}
                filas={ESTADOS_DE_CUIDADOR.map(({ estado, nombre }) => ({ nombre, cantidad: cuidadores.porEstado[estado] }))}
              />
              <Distribucion
                titulo="Visibles por especialidad"
                total={cuidadores.visibles}
                filas={ESPECIALIDADES.map((e) => ({ nombre: etiquetaEspecialidad(e), cantidad: cuidadores.visiblesPorEspecialidad[e] }))}
              />
            </>
          )}
        </article>
      </div>
    </section>
  );
}
