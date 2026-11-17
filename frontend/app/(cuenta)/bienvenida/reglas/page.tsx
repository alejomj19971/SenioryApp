import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioReglas } from "@/components/cuenta/formulario-reglas";
import { destinoTrasIngresar } from "@/lib/redireccion";
import { verificarSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Antes de empezar" };

export default async function ReglasPage() {
  const perfil = await verificarSesion();
  // Sin persona, sin consentimiento o ya vistas, no hay nada que mostrar aquí.
  if (
    perfil.usuario.rol !== "familiar" ||
    perfil.adultosMayores.length === 0 ||
    !perfil.adultosMayores.some((p) => p.consentimientoDeSalud) ||
    perfil.usuario.reglasDelNegocioVistas
  ) {
    redirect(
      destinoTrasIngresar({
        rol: perfil.usuario.rol,
        adultosMayores: perfil.adultosMayores,
        reglasDelNegocioVistas: perfil.usuario.reglasDelNegocioVistas,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Paso 3 de 3</p>
        <h1 className="text-2xl font-bold text-foreground">Antes de empezar</h1>
        <p className="text-base text-muted-foreground">Así funciona Seniory. Lo vas a ver una sola vez.</p>
      </div>
      <FormularioReglas />
    </div>
  );
}
