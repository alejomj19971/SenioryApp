"use server";

import { redirect } from "next/navigation";
import { escribirEnBackend, leerDelBackend, pedirAlBackend } from "@/lib/api/cliente-servidor";
import type { RespuestaDePerfil } from "@/lib/api/contratos/identidad";
import { ErrorDeApi } from "@/lib/api/error-de-api";
import type { EstadoDeFormulario } from "@/lib/acciones/estado";
import { estadoDeError } from "@/lib/acciones/errores-de-cuenta";
import {
  normalizarTelefono,
  soloErrores,
  texto,
  validarContrasenaNueva,
  validarCorreo,
  validarFechaDeNacimiento,
  validarNombre,
  validarParentesco,
  validarTelefonoOpcional,
} from "@/lib/acciones/validar-cuenta";
import { VERSION_DE_LA_POLITICA, VERSION_DEL_CONSENTIMIENTO_DE_SALUD } from "@/lib/legal/versiones";
import { destinoTrasIngresar } from "@/lib/redireccion";
import { borrarSesion, guardarSesion, tokenDeRefresco, verificarSesion } from "@/lib/sesion";
import { COOKIE_DE_ACCESO } from "@/lib/sesion/constantes";
import { cookiesDeSesionDe } from "@/lib/sesion/cookies";

// Acciones de cuenta (F1 §4.4). Son endpoints públicos: validan su entrada y dejan que el backend autorice.
// Los errores esperados se devuelven como valor; un éxito redirige.

// Envía un POST sin sesión (registro, inicio de sesión…). Devuelve la respuesta cruda o el error ya traducido.
async function enviarSinSesion(
  ruta: string,
  cuerpo: unknown,
): Promise<{ respuesta: Response } | { error: ErrorDeApi }> {
  try {
    const respuesta = await pedirAlBackend(ruta, { metodo: "POST", cuerpo, sinSesion: true });
    return respuesta.ok ? { respuesta } : { error: await ErrorDeApi.desdeRespuesta(respuesta) };
  } catch (causa) {
    if (causa instanceof ErrorDeApi) return { error: causa };
    throw causa;
  }
}

// El registro de una familia y el de un cuidador se parecen: cambian la ruta del backend y a dónde se va después.
async function registrarCuenta(ruta: string, destino: string, datos: FormData): Promise<EstadoDeFormulario> {
  const valores = {
    nombre: texto(datos, "nombre").trim(),
    correo: texto(datos, "correo").trim(),
    telefono: texto(datos, "telefono").trim(),
    // React reinicia el formulario después de cada acción: la casilla se conserva para no pedirla otra vez.
    aceptaPolitica: texto(datos, "aceptaPolitica") === "on" ? "on" : "",
  };
  const contrasena = texto(datos, "contrasena");
  const errores = soloErrores({
    nombre: validarNombre(valores.nombre),
    correo: validarCorreo(valores.correo),
    telefono: validarTelefonoOpcional(valores.telefono),
    contrasena: validarContrasenaNueva(contrasena),
    aceptaPolitica:
      texto(datos, "aceptaPolitica") === "on"
        ? undefined
        : "Para crear tu cuenta debes aceptar la política de tratamiento de datos.",
  });
  if (Object.keys(errores).length > 0) return { errores, valores };

  const resultado = await enviarSinSesion(ruta, {
    nombre: valores.nombre,
    correo: valores.correo,
    contrasena,
    ...(valores.telefono === "" ? {} : { telefono: normalizarTelefono(valores.telefono) }),
    versionPolitica: VERSION_DE_LA_POLITICA,
  });
  if ("error" in resultado) return estadoDeError(resultado.error, valores);

  await guardarSesion(resultado.respuesta);
  redirect(destino);
}

// Una cuenta nueva siempre empieza por la persona a la que va a cuidar.
export async function registrarse(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  return registrarCuenta("/auth/registro", "/bienvenida/persona", datos);
}

// Un cuidador que se postula empieza por armar su perfil; no se muestra a nadie hasta que un revisor lo apruebe.
export async function registrarseComoCuidador(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  return registrarCuenta("/auth/registro-cuidador", "/cuidador/perfil", datos);
}

// Cierra el ingreso una vez el backend dio la sesión de verdad (con o sin segundo factor de por medio).
async function completarIngreso(respuestaDelBackend: Response, volver: string): Promise<never> {
  await guardarSesion(respuestaDelBackend);
  // La cookie recién guardada todavía no viaja en esta petición: se usa el token a mano para saber a dónde ir.
  const acceso = cookiesDeSesionDe(respuestaDelBackend).find((c) => c.nombre === COOKIE_DE_ACCESO)?.valor;
  const perfil = await leerDelBackend<RespuestaDePerfil>("/yo", acceso === undefined ? {} : { tokenDeAcceso: acceso });
  redirect(
    destinoTrasIngresar(
      {
        rol: perfil.usuario.rol,
        adultosMayores: perfil.adultosMayores,
        reglasDelNegocioVistas: perfil.usuario.reglasDelNegocioVistas,
      },
      volver,
    ),
  );
}

interface RespuestaDeIngreso {
  requiereSegundoFactor?: true;
  desafio?: string;
}

// Correo y contraseña, y a veces un segundo paso (el código de la app autenticadora de un administrador): la
// propia presencia del campo oculto `desafio` dice en cuál de los dos pasos está el formulario.
export async function iniciarSesion(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const volver = texto(datos, "volver");
  const desafioPrevio = texto(datos, "desafio");

  if (desafioPrevio !== "") {
    const codigo = texto(datos, "codigo").trim();
    if (codigo === "") return { errores: { codigo: "Escribe el código." }, valores: { desafio: desafioPrevio } };

    const resultado = await enviarSinSesion("/auth/login/segundo-factor", { desafio: desafioPrevio, codigo });
    if ("error" in resultado) {
      // Un desafío vencido o ya usado no se puede reintentar: sin `desafio` en los valores, la pantalla vuelve
      // a pedir correo y contraseña en vez de insistir con el código.
      if (resultado.error.codigo === "segundo_factor.desafio_invalido") {
        return estadoDeError(resultado.error);
      }
      return estadoDeError(resultado.error, { desafio: desafioPrevio });
    }

    return completarIngreso(resultado.respuesta, volver);
  }

  const correo = texto(datos, "correo").trim();
  const contrasena = texto(datos, "contrasena");
  const errores = soloErrores({
    correo: correo === "" ? "Escribe tu correo." : undefined,
    contrasena: contrasena === "" ? "Escribe tu contraseña." : undefined,
  });
  if (Object.keys(errores).length > 0) return { errores, valores: { correo } };

  const resultado = await enviarSinSesion("/auth/login", { correo, contrasena });
  if ("error" in resultado) return estadoDeError(resultado.error, { correo });

  const cuerpo = (await resultado.respuesta.json()) as RespuestaDeIngreso;
  if (cuerpo.requiereSegundoFactor === true && cuerpo.desafio !== undefined) {
    return { valores: { desafio: cuerpo.desafio } };
  }

  return completarIngreso(resultado.respuesta, volver);
}

// Nunca falla para quien la usa: si el backend no responde, las cookies se borran igual.
export async function cerrarSesion(): Promise<void> {
  const refresco = await tokenDeRefresco();
  try {
    await pedirAlBackend("/auth/logout", {
      metodo: "POST",
      sinSesion: true,
      ...(refresco === undefined ? {} : { tokenDeRefresco: refresco }),
    });
  } catch {
    // Sin conexión con el backend: el refresco queda vigente allá hasta que venza, pero esta persona sale.
  }
  await borrarSesion();
  redirect("/ingresar");
}

export async function solicitarRecuperacion(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const correo = texto(datos, "correo").trim();
  if (correo === "") return { errores: { correo: "Escribe tu correo." }, valores: { correo } };

  const resultado = await enviarSinSesion("/auth/olvide-contrasena", { correo });
  if ("error" in resultado) return estadoDeError(resultado.error, { correo });
  // Responde igual exista o no la cuenta: la pantalla tampoco lo revela.
  return { listo: true, valores: { correo } };
}

export async function restablecerContrasena(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const token = texto(datos, "token");
  const contrasena = texto(datos, "contrasena");
  const errores = soloErrores({
    contrasena: validarContrasenaNueva(contrasena),
    confirmacion: contrasena === texto(datos, "confirmacion") ? undefined : "Las dos contraseñas deben ser iguales.",
  });
  if (token === "") return { mensaje: "El enlace no es válido. Pide uno nuevo." };
  if (Object.keys(errores).length > 0) return { errores };

  const resultado = await enviarSinSesion("/auth/restablecer-contrasena", { token, contrasenaNueva: contrasena });
  if ("error" in resultado) return estadoDeError(resultado.error);
  // Restablecer no inicia sesión: se entra con la contraseña nueva.
  redirect("/ingresar?restablecida=1");
}

// Abrir el enlace que llegó al correo: confirma que el correo es de la persona. No exige sesión (se abre desde el correo, quizá en
// otro navegador). Es una acción y no un GET para que un antivirus que abre los enlaces del correo no lo gaste por la persona.
export async function confirmarCorreo(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const token = texto(datos, "token");
  if (token === "") return { mensaje: "El enlace no es válido. Pide uno nuevo desde tu cuenta." };

  const resultado = await enviarSinSesion("/auth/verificar-correo", { token });
  if ("error" in resultado) return estadoDeError(resultado.error);
  return { listo: true };
}

// «Reenviar enlace» desde el aviso de la cuenta: pide otro enlace para el correo de quien tiene la sesión.
export async function reenviarVerificacionDeCorreo(): Promise<{ ok: boolean; mensaje: string }> {
  const resultado = await escribirEnBackend<{ resultado: string }>("/yo/correo/verificacion", { metodo: "POST" });
  if (!resultado.ok) {
    return { ok: false, mensaje: resultado.error.estado === 429 ? "Espera un momento antes de pedir otro enlace." : "No pudimos enviar el enlace. Inténtalo de nuevo en unos minutos." };
  }
  switch (resultado.datos.resultado) {
    case "enviado":
      return { ok: true, mensaje: "Listo: te enviamos un enlace nuevo. Revisa tu correo (y la carpeta de spam)." };
    case "demasiado_pronto":
      return { ok: true, mensaje: "Ya te enviamos un enlace hace un momento. Revisa tu correo (y la carpeta de spam), o espera un minuto para pedir otro." };
    case "ya_verificado":
      return { ok: true, mensaje: "Tu correo ya está confirmado." };
    case "no_disponible":
      return { ok: false, mensaje: "El envío de correos no está disponible por ahora. Inténtalo más tarde." };
    default:
      return { ok: false, mensaje: "No pudimos enviar el enlace. Inténtalo de nuevo en unos minutos." };
  }
}

export async function registrarAdultoMayor(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const valores = {
    nombre: texto(datos, "nombre").trim(),
    dia: texto(datos, "dia"),
    mes: texto(datos, "mes"),
    anio: texto(datos, "anio"),
    parentesco: texto(datos, "parentesco"),
  };
  const fecha = validarFechaDeNacimiento(valores.dia, valores.mes, valores.anio);
  const errores = soloErrores({
    nombre: validarNombre(valores.nombre, "El nombre de la persona"),
    fecha: "error" in fecha ? fecha.error : undefined,
    parentesco: validarParentesco(valores.parentesco),
  });
  if (Object.keys(errores).length > 0 || "error" in fecha) return { errores, valores };

  const resultado = await escribirEnBackend("/adultos-mayores", {
    metodo: "POST",
    cuerpo: { nombre: valores.nombre, fechaDeNacimiento: fecha.fecha, parentesco: valores.parentesco },
  });
  if (!resultado.ok) return estadoDeError(resultado.error, valores);
  redirect("/bienvenida/consentimiento");
}

export async function otorgarConsentimiento(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  if (texto(datos, "autorizo") !== "on") {
    return { errores: { autorizo: "Para continuar debes autorizar el tratamiento de los datos de salud." } };
  }
  // La persona se toma de la sesión, no del formulario: nadie puede autorizar por otra con un campo oculto.
  const perfil = await verificarSesion();
  const siguienteDestino = (adultosMayores: typeof perfil.adultosMayores) =>
    destinoTrasIngresar({
      rol: "familiar",
      adultosMayores,
      reglasDelNegocioVistas: perfil.usuario.reglasDelNegocioVistas,
    });
  const persona = perfil.adultosMayores.find((p) => !p.consentimientoDeSalud);
  if (persona === undefined) redirect(siguienteDestino(perfil.adultosMayores));

  const resultado = await escribirEnBackend(`/adultos-mayores/${persona.id}/consentimientos`, {
    metodo: "POST",
    cuerpo: {
      finalidad: "datos_de_salud",
      // Quien se registra es el familiar: actúa como representante hasta que Legal decida quién acepta.
      calidad: "representante",
      versionDelTexto: VERSION_DEL_CONSENTIMIENTO_DE_SALUD,
    },
  });
  // «Ya hay una autorización vigente» no es un problema: la persona ya está donde quería llegar.
  if (!resultado.ok && resultado.error.codigo !== "consentimiento.ya_vigente") return estadoDeError(resultado.error);
  const adultosMayoresActualizados = perfil.adultosMayores.map((p) =>
    p.id === persona.id ? { ...p, consentimientoDeSalud: true } : p,
  );
  redirect(siguienteDestino(adultosMayoresActualizados));
}

// Último paso de la bienvenida: acepta el instructivo con las reglas del negocio y entra a la aplicación.
// Idempotente en el backend, así que un reintento (o un doble clic) no es un problema.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma la exige `useActionState`.
export async function aceptarReglasDelNegocio(_previo: EstadoDeFormulario): Promise<EstadoDeFormulario> {
  const resultado = await escribirEnBackend("/yo/reglas-del-negocio", { metodo: "POST" });
  if (!resultado.ok) return estadoDeError(resultado.error);
  redirect("/app");
}

export async function cambiarContrasena(_previo: EstadoDeFormulario, datos: FormData): Promise<EstadoDeFormulario> {
  const actual = texto(datos, "contrasenaActual");
  const nueva = texto(datos, "contrasena");
  const errores = soloErrores({
    contrasenaActual: actual === "" ? "Escribe tu contraseña actual." : undefined,
    contrasena: validarContrasenaNueva(nueva),
    confirmacion: nueva === texto(datos, "confirmacion") ? undefined : "Las dos contraseñas deben ser iguales.",
  });
  if (Object.keys(errores).length > 0) return { errores };

  let respuesta: Response;
  try {
    respuesta = await pedirAlBackend("/yo/contrasena", {
      metodo: "PATCH",
      cuerpo: { contrasenaActual: actual, contrasenaNueva: nueva },
    });
  } catch (causa) {
    if (causa instanceof ErrorDeApi) return estadoDeError(causa);
    throw causa;
  }
  if (respuesta.status === 401) redirect("/ingresar");
  if (!respuesta.ok) return estadoDeError(await ErrorDeApi.desdeRespuesta(respuesta));
  // Cambiar la contraseña cierra las demás sesiones y abre una nueva para quien la cambió: hay que guardarla.
  await guardarSesion(respuesta);
  return { listo: true };
}
