import Link from "next/link";
import { Check, HeartHandshake } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatearCOP } from "@/lib/format";
import { listarPaquetesParaLaPaginaPublica } from "@/lib/services/pagos";

// Las bolsas de horas con sus precios REALES: salen del catálogo del backend, que viene vacío hasta que el negocio
// los aprueba. Mientras no haya paquetes (o el servicio no responda) la sección lo dice con honestidad: nunca
// precios de ejemplo. La landing no se rompe si el backend no responde.
export async function Bolsas() {
  const paquetes = await listarPaquetesParaLaPaginaPublica();
  const mayorDescuento = Math.max(0, ...(paquetes ?? []).map((paquete) => paquete.descuento));

  return (
    <section id="precios" className="bg-secondary/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Bolsas de horas con descuento</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {paquetes !== null && paquetes.length > 0
              ? "Prepaga horas de cuidado para tu familia y ahorra."
              : "Pronto podrás prepagar horas de cuidado con descuento. Mientras tanto, pagas cada servicio en línea."}
          </p>
        </div>

        {paquetes !== null && paquetes.length > 0 && (
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {paquetes.map((paquete) => {
              const destacado = mayorDescuento > 0 && paquete.descuento === mayorDescuento;
              return (
                <div
                  key={paquete.codigo}
                  className={`flex flex-col gap-4 rounded-2xl p-7 ${destacado ? "bg-primary text-primary-foreground ring-2 ring-primary" : "bg-card ring-1 ring-border"}`}
                >
                  {destacado && (
                    <span className="w-fit rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">Mayor ahorro</span>
                  )}
                  <p className="text-4xl font-extrabold">{paquete.horasReferencia} horas</p>
                  {paquete.descuento > 0 && (
                    <p className={`text-base font-medium ${destacado ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                      {paquete.descuento.toLocaleString("es-CO")} % de descuento
                    </p>
                  )}
                  <p className="text-2xl font-bold">{formatearCOP(paquete.precio)}</p>
                  <ul className={`flex flex-col gap-2 text-base ${destacado ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 shrink-0" aria-hidden="true" /> Recibes {formatearCOP(paquete.credito)} para tus servicios
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 shrink-0" aria-hidden="true" /> Válido con cualquier cuidador verificado
                    </li>
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {paquetes !== null && paquetes.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Link href="/registro" className={buttonVariants({ size: "lg" })}>
              Crear cuenta para comprar
            </Link>
          </div>
        )}

        <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-3 rounded-2xl bg-secondary/60 px-6 py-4 text-center">
          <HeartHandshake className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">La teleasistencia siempre es gratis. Ninguna membresía paga.</p>
        </div>
      </div>
    </section>
  );
}
