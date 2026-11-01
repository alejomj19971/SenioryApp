import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { leerDelBackend } from "@/lib/api/cliente-servidor";
import type { RespuestaDePerfil } from "@/lib/api/contratos/identidad";
import type { Rol } from "@/lib/api/contratos/identidad";
import { destinoTrasIngresar } from "@/lib/redireccion";
import { COOKIE_DE_ACCESO, COOKIE_DE_REFRESCO } from "@/lib/sesion/constantes";
import { cookiesDeSesionDe, opcionesDeCookie } from "@/lib/sesion/cookies";

// La sesión en el dominio de Next (F1 §4.2). Los tokens viven en cookies `HttpOnly` que escribe SOLO el
// servidor: ningún componente cliente los ve. Solo se puede escribir cookies desde una acción de servidor o un
// route handler (restricción de Next 16); `proxy.ts` hace su propia escritura.

// Copia a las cookies de Next las que el backend puso en su respuesta (inicio de sesión, registro, cambio de
// contraseña). Una cookie que el backend manda borrar, se borra.
export async function guardarSesion(respuestaDelBackend: Response): Promise<void> {
  const almacen = await cookies();
  for (const cookie of cookiesDeSesionDe(respuestaDelBackend)) {
    if (cookie.valor === "") almacen.delete({ name: cookie.nombre, path: "/" });
    else almacen.set(cookie.nombre, cookie.valor, opcionesDeCookie(cookie.expira));
  }
}

export async function borrarSesion(): Promise<void> {
  const almacen = await cookies();
  almacen.delete({ name: COOKIE_DE_ACCESO, path: "/" });
  almacen.delete({ name: COOKIE_DE_REFRESCO, path: "/" });
}

export async function tokenDeRefresco(): Promise<string | undefined> {
  const valor = (await cookies()).get(COOKIE_DE_REFRESCO)?.value;
  return valor === undefined || valor === "" ? undefined : valor;
}

// La verificación REAL de la sesión: pregunta al backend quién es y qué personas cuida. Memorizada durante un
// render, así varias partes de la misma página no repiten la consulta. Un 401 redirige a `/ingresar`.
export const verificarSesion = cache((): Promise<RespuestaDePerfil> => leerDelBackend<RespuestaDePerfil>("/yo"));

// Exige que la sesión sea de ese rol (el área del cuidador, el panel de administración); a cualquier otra persona la
// lleva a donde le corresponde. El backend vuelve a verificar el rol en cada ruta: esto solo evita mostrar pantallas
// que no le sirven.
export async function exigirRol(rol: Rol): Promise<RespuestaDePerfil> {
  const perfil = await verificarSesion();
  if (perfil.usuario.rol !== rol) {
    redirect(destinoTrasIngresar({ rol: perfil.usuario.rol, adultosMayores: perfil.adultosMayores }));
  }
  return perfil;
}
