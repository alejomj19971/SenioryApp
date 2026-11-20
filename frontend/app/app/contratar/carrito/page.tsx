import { redirect } from "next/navigation";
import { CarritoDeContratacion } from "@/components/contratacion/carrito-de-contratacion";
import { ahoraEnColombia } from "@/lib/fecha-colombia";
import { obtenerBolsa } from "@/lib/services/pagos";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { cotizar } from "@/lib/services/servicios";
import type { Cotizacion, Cuidador } from "@/lib/types";

export const metadata = {
  title: "Contratar varios cuidadores",
};

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CarritoDeContratacionPage({ searchParams }: PageProps<"/app/contratar/carrito">) {
  await exigirFamiliaLista();
  const { ids: parametroIds } = await searchParams;
  const texto = Array.isArray(parametroIds) ? (parametroIds[0] ?? "") : (parametroIds ?? "");
  const ids = [...new Set(texto.split(",").filter((id) => FORMATO_DE_UUID.test(id)))];
  if (ids.length === 0) redirect("/app/cuidadores");

  // Si uno de los ids ya no existe (perfil borrado, id inventado en la URL), se descarta en silencio: no hace
  // falta romper la pantalla de los demás por uno malo.
  const [cuidadores, bolsa] = await Promise.all([
    Promise.all(ids.map((id) => obtenerCuidador(id))),
    obtenerBolsa(),
  ]);
  const encontrados = cuidadores.filter((cuidador): cuidador is Cuidador => cuidador !== null);
  if (encontrados.length === 0) redirect("/app/cuidadores");

  // El precio de 1 hora, igual que al contratar a uno solo: el servidor lo calcula antes de mostrar nada.
  const cotizaciones = await Promise.all(encontrados.map((cuidador) => cotizar(cuidador.id, 1)));
  const cotizacionesIniciales = new Map<string, Cotizacion | null>(
    encontrados.map((cuidador, indice) => [cuidador.id, cotizaciones[indice]?.ok ? cotizaciones[indice].datos : null]),
  );

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Contratar varios cuidadores</h1>
        <p className="text-base text-muted-foreground">
          {encontrados.length === 1 ? "1 cuidador seleccionado" : `${encontrados.length} cuidadores seleccionados`}
        </p>
      </div>
      <CarritoDeContratacion
        cuidadores={encontrados}
        ahora={ahoraEnColombia()}
        cotizacionesIniciales={cotizacionesIniciales}
        saldoDeLaBolsa={bolsa.saldoDisponible}
      />
    </div>
  );
}
