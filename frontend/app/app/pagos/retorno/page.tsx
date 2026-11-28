import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EsperandoElPago } from "@/components/pagos/esperando-el-pago";
import { Aviso } from "@/components/ui/aviso";
import { listarPagos } from "@/lib/services/pagos";

export const metadata: Metadata = { title: "Verificando tu pago" };

// A donde vuelve la familia después de pagar. El navegador nunca decide que algo está pagado: esta pantalla le pregunta al
// servidor cómo va ese pago y, en cuanto está aprobado, la lleva a su servicio. Mientras el aviso de la pasarela no llega
// (puede tardar unos segundos), espera y vuelve a preguntar.
export default async function RetornoDelPagoPage({ searchParams }: PageProps<"/app/pagos/retorno">) {
  const consulta = await searchParams;
  const pagoId = typeof consulta.pago === "string" ? consulta.pago : "";
  const pago = pagoId === "" ? undefined : (await listarPagos()).find((p) => p.id === pagoId);
  // Un pago que no es de esta persona (o un enlace inventado) no se explica: vuelve al inicio.
  if (pago === undefined) redirect("/app");

  const destino = pago.servicioId === null ? "/app/bolsa" : `/app/servicios/${pago.servicioId}`;
  if (pago.estado === "aprobado" || pago.estado === "reembolsado") redirect(destino);

  if (pago.estado === "rechazado" || pago.estado === "expirado") {
    return (
      <div className="flex flex-col gap-4 px-4 py-8">
        <Aviso
          titulo={pago.estado === "expirado" ? "El pago venció" : "El pago no se completó"}
          descripcion="No se te cobró nada. Puedes volver a intentarlo desde tu servicio."
        />
        <Link href={destino} className="inline-flex min-h-12 w-fit items-center font-medium text-primary underline underline-offset-4">
          Volver a mi servicio
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-8">
      <EsperandoElPago servicioId={pago.servicioId} />
    </div>
  );
}
