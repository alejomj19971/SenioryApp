import Link from "next/link";
import { Wallet } from "lucide-react";
import { TarjetaDePaquete } from "@/components/pagos/tarjeta-de-paquete";
import { formatearCOP, formatearFechaHora } from "@/lib/format";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { listarPaquetes, obtenerBolsa } from "@/lib/services/pagos";

export const metadata = {
  title: "Mi bolsa de horas",
};

const ETIQUETAS_DE_MOVIMIENTO: Record<string, string> = {
  compra: "Compra de la bolsa",
  reserva: "Apartado para un servicio",
  consumo: "Servicio realizado",
  liberacion: "Devuelto a tu bolsa",
  ajuste: "Ajuste",
};

export default async function BolsaPage() {
  await exigirFamiliaLista();
  const [bolsa, paquetes] = await Promise.all([obtenerBolsa(), listarPaquetes()]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi bolsa de horas</h1>
        <p className="text-base text-muted-foreground">Prepaga cuidado y paga tus servicios desde aquí.</p>
      </div>

      <section aria-label="Saldo" className="flex flex-col gap-1 rounded-2xl bg-primary p-5 text-primary-foreground">
        <p className="flex items-center gap-2 text-base">
          <Wallet className="size-5" aria-hidden="true" />
          Disponible
        </p>
        <p className="text-4xl font-extrabold">{formatearCOP(bolsa.saldoDisponible)}</p>
        {bolsa.saldoReservado > 0 && (
          <p className="text-base">{formatearCOP(bolsa.saldoReservado)} apartados para servicios que ya aceptaron.</p>
        )}
      </section>

      <section aria-labelledby="titulo-paquetes" className="flex flex-col gap-3">
        <h2 id="titulo-paquetes" className="text-lg font-semibold text-foreground">
          Comprar horas
        </h2>
        {paquetes.length > 0 ? (
          paquetes.map((paquete) => <TarjetaDePaquete key={paquete.codigo} paquete={paquete} />)
        ) : (
          <p role="status" className="rounded-2xl bg-muted p-4 text-base text-muted-foreground">
            Todavía no hay paquetes a la venta. Estamos definiendo los precios; mientras tanto puedes pagar cada servicio en línea.
          </p>
        )}
      </section>

      <section aria-labelledby="titulo-movimientos" className="flex flex-col gap-3">
        <h2 id="titulo-movimientos" className="text-lg font-semibold text-foreground">
          Movimientos
        </h2>
        {bolsa.movimientos.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
            {bolsa.movimientos.map((movimiento) => (
              <li key={movimiento.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-base font-medium text-foreground">{ETIQUETAS_DE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo}</p>
                  <p className="text-sm text-muted-foreground">{formatearFechaHora(movimiento.fecha)}</p>
                </div>
                {movimiento.cambio !== 0 && (
                  <p className="text-base font-semibold text-foreground">
                    {movimiento.cambio > 0 ? "+" : "−"}
                    {formatearCOP(Math.abs(movimiento.cambio))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-muted-foreground">Todavía no tienes movimientos.</p>
        )}
      </section>

      <Link href="/app/cuidadores" className="inline-flex min-h-12 items-center justify-center font-medium text-primary underline underline-offset-4">
        Buscar un cuidador
      </Link>
    </div>
  );
}
