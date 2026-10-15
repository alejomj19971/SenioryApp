import { Check, HeartHandshake } from "lucide-react";
import { formatearCOP } from "@/lib/format";

const paquetes = [
  { horas: 10, descuento: 5, destacado: false },
  { horas: 20, descuento: 8, destacado: true },
  { horas: 40, descuento: 12, destacado: false },
];

const TARIFA_REFERENCIA = 21600; // total con cargo de servicio, ejemplo del pitch

export function Bolsas() {
  return (
    <section id="precios" className="bg-secondary/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Bolsas de horas con descuento
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Prepaga horas de cuidado para tu familia y ahorra. Precios de
            referencia, ilustrativos para la demo.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {paquetes.map((paquete) => {
            const subtotal = TARIFA_REFERENCIA * paquete.horas;
            const totalConDescuento = Math.round(
              subtotal * (1 - paquete.descuento / 100),
            );
            return (
              <div
                key={paquete.horas}
                className={`flex flex-col gap-4 rounded-2xl p-7 ${
                  paquete.destacado
                    ? "bg-primary text-primary-foreground ring-2 ring-primary"
                    : "bg-card ring-1 ring-border"
                }`}
              >
                {paquete.destacado && (
                  <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                    Más popular
                  </span>
                )}
                <p className="text-4xl font-extrabold">{paquete.horas} horas</p>
                <p
                  className={`text-sm font-medium ${
                    paquete.destacado ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {paquete.descuento}% de descuento
                </p>
                <p className="text-2xl font-bold">
                  {formatearCOP(totalConDescuento)}
                </p>
                <ul
                  className={`flex flex-col gap-2 text-sm ${
                    paquete.destacado ? "text-primary-foreground/90" : "text-muted-foreground"
                  }`}
                >
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0" aria-hidden="true" /> Válido con cualquier
                    cuidador verificado
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0" aria-hidden="true" /> Sin fecha de
                    vencimiento
                  </li>
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-3 rounded-2xl bg-secondary/60 px-6 py-4 text-center">
          <HeartHandshake className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">
            La teleasistencia siempre es gratis. Ninguna membresía paga.
          </p>
        </div>
      </div>
    </section>
  );
}
