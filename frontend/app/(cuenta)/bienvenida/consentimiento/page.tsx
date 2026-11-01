import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioConsentimiento } from "@/components/cuenta/formulario-consentimiento";
import { destinoTrasIngresar } from "@/lib/redireccion";
import { verificarSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Autorización de datos de salud" };

export default async function ConsentimientoPage() {
  const perfil = await verificarSesion();
  const persona = perfil.adultosMayores.find((p) => !p.consentimientoDeSalud);
  // Sin persona o con todo autorizado, no hay nada que pedir aquí.
  if (perfil.usuario.rol !== "familiar" || persona === undefined) {
    redirect(destinoTrasIngresar({ rol: perfil.usuario.rol, adultosMayores: perfil.adultosMayores }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Paso 2 de 2</p>
        <h1 className="text-2xl font-bold text-foreground">Tu autorización</h1>
        <p className="text-base text-muted-foreground">
          Los datos de salud son sensibles. Los usamos solo con tu permiso.
        </p>
      </div>
      <FormularioConsentimiento nombreDeLaPersona={persona.nombre} />
    </div>
  );
}
