import { notFound } from "next/navigation";
import { FormularioContratacion } from "@/components/contratacion/formulario-contratacion";
import { obtenerCuidador } from "@/lib/services/cuidadores";

export default async function ContratarPage({
  params,
}: PageProps<"/app/contratar/[id]">) {
  const { id } = await params;
  const cuidador = await obtenerCuidador(id);

  if (!cuidador) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Contratar por horas</h1>
        <p className="text-base text-muted-foreground">
          Con {cuidador.nombre.split(" ")[0]} · {cuidador.zona}
        </p>
      </div>
      <FormularioContratacion cuidador={cuidador} />
    </div>
  );
}
