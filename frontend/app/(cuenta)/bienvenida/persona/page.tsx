import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioPersona } from "@/components/cuenta/formulario-persona";
import { destinoTrasIngresar } from "@/lib/redireccion";
import { verificarSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "¿A quién vas a cuidar?" };

export default async function PersonaPage() {
  const perfil = await verificarSesion();
  // Quien ya tiene a su persona (o no es de una familia) sigue por donde corresponde.
  if (perfil.usuario.rol !== "familiar" || perfil.adultosMayores.length > 0) {
    redirect(destinoTrasIngresar({ rol: perfil.usuario.rol, adultosMayores: perfil.adultosMayores }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Paso 1 de 2</p>
        <h1 className="text-2xl font-bold text-foreground">¿A quién vas a cuidar?</h1>
        <p className="text-base text-muted-foreground">
          Con estos datos buscamos al cuidador adecuado y armamos su seguimiento.
        </p>
      </div>
      <FormularioPersona anioActual={new Date().getFullYear()} />
    </div>
  );
}
