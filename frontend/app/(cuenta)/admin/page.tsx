import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaEnConstruccion } from "@/components/cuenta/area-en-construccion";
import { destinoTrasIngresar } from "@/lib/redireccion";
import { verificarSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Panel de administración" };

// Se construye en F9 (panel de revisores).
export default async function AdminPage() {
  const perfil = await verificarSesion();
  if (perfil.usuario.rol !== "administrador") {
    redirect(destinoTrasIngresar({ rol: perfil.usuario.rol, adultosMayores: perfil.adultosMayores }));
  }
  return <AreaEnConstruccion titulo="panel de revisión" nombre={perfil.usuario.nombre} />;
}
