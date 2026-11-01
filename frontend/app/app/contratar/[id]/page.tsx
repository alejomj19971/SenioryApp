import { notFound } from "next/navigation";
import { FormularioContratacion } from "@/components/contratacion/formulario-contratacion";
import { ahoraEnColombia } from "@/lib/fecha-colombia";
import { obtenerBolsa } from "@/lib/services/pagos";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { cotizar } from "@/lib/services/servicios";

export const metadata = {
  title: "Contratar por horas",
};

export default async function ContratarPage({ params }: PageProps<"/app/contratar/[id]">) {
  const { id } = await params;
  await exigirFamiliaLista();
  const cuidador = await obtenerCuidador(id);
  if (!cuidador) notFound();

  // El precio de 1 hora y el saldo de la bolsa los pone el servidor; «hoy» es el de Colombia, no el del navegador.
  const [cotizacion, bolsa] = await Promise.all([cotizar(cuidador.id, 1), obtenerBolsa()]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Contratar por horas</h1>
        <p className="text-base text-muted-foreground">
          Con {cuidador.nombre.split(" ")[0]} · {cuidador.zona}
        </p>
      </div>
      <FormularioContratacion
        cuidador={cuidador}
        ahora={ahoraEnColombia()}
        cotizacionInicial={cotizacion.ok ? cotizacion.datos : null}
        saldoDeLaBolsa={bolsa.saldoDisponible}
      />
    </div>
  );
}
