import "server-only";
import { redirect } from "next/navigation";
import cuidadorEnTurnoData from "@/data/cuidador-en-turno.json";
import type { AdultoMayorDelBackend, RespuestaDePerfil } from "@/lib/api/contratos/identidad";
import { obtenerCuidador } from "@/lib/services/cuidadores";
import { verificarSesion } from "@/lib/sesion";
import type { AdultoMayor, Cuidador, Familiar } from "@/lib/types";

// La familia y la persona a cuidar, desde la sesión real (F1 §4.5). Quien llega aquí ya pasó por el layout de
// `/app`, que garantiza una familia con persona y consentimiento; si no, se la manda a completarlo.

// La persona que la familia cuida: la que tiene como responsable, o la primera.
function personaPrincipal(perfil: RespuestaDePerfil): AdultoMayorDelBackend | undefined {
  return perfil.adultosMayores.find((persona) => persona.esResponsable) ?? perfil.adultosMayores[0];
}

// Exige que la sesión sea de una familia lista para usar la app. Si le falta un paso, la lleva a completarlo.
export async function exigirFamiliaLista(): Promise<{ perfil: RespuestaDePerfil; persona: AdultoMayorDelBackend }> {
  const perfil = await verificarSesion();
  if (perfil.usuario.rol === "cuidador") redirect("/cuidador");
  if (perfil.usuario.rol === "administrador") redirect("/admin");
  const persona = personaPrincipal(perfil);
  if (persona === undefined) redirect("/bienvenida/persona");
  if (!perfil.adultosMayores.some((p) => p.consentimientoDeSalud)) redirect("/bienvenida/consentimiento");
  return { perfil, persona };
}

export async function obtenerFamiliar(): Promise<Familiar> {
  const { perfil, persona } = await exigirFamiliaLista();
  return { id: perfil.usuario.id, nombre: perfil.usuario.nombre, foto: "", adultoMayorId: persona.id };
}

export async function obtenerAdultoMayor(): Promise<AdultoMayor> {
  const { persona } = await exigirFamiliaLista();
  return {
    id: persona.id,
    nombre: persona.nombre,
    edad: persona.edad,
    foto: persona.fotoUrl ?? "",
    cuidadorAsignadoId: cuidadorEnTurnoData.cuidadorId,
  };
}

// Sigue leyendo `data/` hasta F4 (depende de Reservas).
export async function obtenerCuidadorEnTurno(): Promise<Cuidador | null> {
  return obtenerCuidador(cuidadorEnTurnoData.cuidadorId);
}
