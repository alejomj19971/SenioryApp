import "server-only";
import { redirect } from "next/navigation";
import type { AdultoMayorDelBackend, RespuestaDePerfil } from "@/lib/api/contratos/identidad";
import { obtenerCuidadoresEnTurnoDe } from "@/lib/services/servicios";
import { verificarSesion } from "@/lib/sesion";
import type { AdultoMayor, CuidadorEnTurno, Familiar } from "@/lib/types";

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
  };
}

// Los cuidadores que están con la persona AHORA (un servicio en curso, o aceptado y dentro de su franja);
// arreglo vacío si no hay ninguno. Normalmente es uno solo, pero nada impide tener más de uno contratado a
// la vez. Es el único lugar donde la familia recibe el teléfono de un cuidador (H1, H4).
export async function obtenerCuidadoresEnTurno(): Promise<CuidadorEnTurno[]> {
  const { persona } = await exigirFamiliaLista();
  return obtenerCuidadoresEnTurnoDe(persona.id);
}
