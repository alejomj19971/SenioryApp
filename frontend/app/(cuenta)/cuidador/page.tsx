import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaEnConstruccion } from "@/components/cuenta/area-en-construccion";
import { destinoTrasIngresar } from "@/lib/redireccion";
import { verificarSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Tu panel de cuidador" };

// Se construye en F4 (solicitudes, aceptar, iniciar, finalizar) y F9 (perfil y documentos).
export default async function CuidadorPage() {
  const perfil = await verificarSesion();
  if (perfil.usuario.rol !== "cuidador") {
    redirect(destinoTrasIngresar({ rol: perfil.usuario.rol, adultosMayores: perfil.adultosMayores }));
  }
  return <AreaEnConstruccion titulo="panel de cuidador" nombre={perfil.usuario.nombre} />;
}
