import { BuscadorCuidadores } from "@/components/cuidadores/buscador-cuidadores";
import { listarCuidadores } from "@/lib/services/cuidadores";

export const metadata = {
  title: "Buscar cuidador",
};

export default async function CuidadoresPage() {
  const cuidadores = await listarCuidadores();

  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Buscar cuidador</h1>
        <p className="text-base text-muted-foreground">
          Todos los perfiles están verificados.
        </p>
      </div>
      <BuscadorCuidadores cuidadores={cuidadores} />
    </div>
  );
}
