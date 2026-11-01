import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { ListaDeServicios } from "@/components/servicios/lista-de-servicios";
import { buttonVariants } from "@/components/ui/button";
import { exigirFamiliaLista } from "@/lib/services/paciente";
import { listarServiciosDeLaFamilia } from "@/lib/services/servicios";

export const metadata = {
  title: "Mis servicios",
};

export default async function ServiciosPage() {
  await exigirFamiliaLista();
  const pagina = await listarServiciosDeLaFamilia();

  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mis servicios</h1>
        <p className="text-base text-muted-foreground">Lo que has pedido, del más reciente al más antiguo.</p>
      </div>

      {pagina.servicios.length > 0 ? (
        <ListaDeServicios servicios={pagina.servicios} siguiente={pagina.siguiente} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-8 text-center">
          <ClipboardList className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">Todavía no has pedido ningún servicio</p>
          <p className="text-base text-muted-foreground">Busca un cuidador verificado y pídelo por horas.</p>
          <Link href="/app/cuidadores" className={buttonVariants()}>
            Buscar cuidador
          </Link>
        </div>
      )}
    </div>
  );
}
