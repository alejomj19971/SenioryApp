import type { Metadata } from "next";
import { FormularioCambiarContrasena } from "@/components/cuenta/formulario-cambiar-contrasena";
import { SalirDeLaCuenta } from "@/components/shell/salir-de-la-cuenta";
import { exigirFamiliaLista } from "@/lib/services/paciente";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function CuentaPage() {
  const { perfil } = await exigirFamiliaLista();

  return (
    <div className="flex flex-col gap-8 px-4 py-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Mi cuenta</h1>
        <p className="text-lg font-semibold text-foreground">{perfil.usuario.nombre}</p>
        <p className="text-base text-muted-foreground">{perfil.usuario.correo}</p>
      </section>

      <section aria-labelledby="titulo-contrasena" className="flex flex-col gap-4">
        <h2 id="titulo-contrasena" className="text-xl font-semibold text-foreground">
          Cambiar la contraseña
        </h2>
        <FormularioCambiarContrasena />
      </section>

      <section className="flex flex-col items-start gap-3">
        <h2 className="text-xl font-semibold text-foreground">Salir</h2>
        <SalirDeLaCuenta />
      </section>
    </div>
  );
}
