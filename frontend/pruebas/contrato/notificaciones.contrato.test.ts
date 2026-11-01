// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ahoraEnColombia, sumarDias } from "../../lib/fecha-colombia";
import {
  abrirSesion,
  backendDisponible,
  crearCuenta,
  crearCuidadorVerificado,
  esperarQue,
  hayAdministradorDePrueba,
  pedir,
  URL_DEL_BACKEND,
  type CuentaDePrueba,
} from "../soporte/backend-local";

// Contrato de Notificaciones (INTEGRACION §6) contra el backend local real: la campana de cada persona, solo con SUS
// avisos, del más reciente al más antiguo y con cursor. Sin backend o sin el administrador de prueba, se omite.

const disponible = (await backendDisponible()) && hayAdministradorDePrueba;
const BFF = process.env.SENIORY_BFF_SECRETO ?? "";

interface Persona {
  cuenta: CuentaDePrueba;
  cookie: string;
}
interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  prioridad: "normal" | "alta";
  creadaEn: string;
}
interface Pagina {
  notificaciones: Aviso[];
  siguiente: string | null;
}

async function conSesion(cuenta: CuentaDePrueba): Promise<Persona> {
  return { cuenta, cookie: await abrirSesion(cuenta) };
}

describe.skipIf(!disponible)("contrato de Notificaciones con el backend local", () => {
  let familia: Persona;
  let delCuidador: Persona;
  let ajena: Persona;

  const llamar = (persona: Persona, ruta: string) => pedir(ruta, { cookie: persona.cookie, ip: persona.cuenta.ip });
  const avisosDe = async (persona: Persona, consulta = ""): Promise<Pagina> => {
    const respuesta = await llamar(persona, `/notificaciones${consulta}`);
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as Pagina;
  };

  beforeAll(async () => {
    const cuidador = await crearCuidadorVerificado();
    delCuidador = await conSesion(cuidador.cuentaDeAcceso);
    const cuenta = await crearCuenta({ lista: true });
    familia = await conSesion(cuenta);
    ajena = await conSesion(await crearCuenta({ lista: true }));
    const perfil = (await (await llamar(familia, "/yo")).json()) as { adultosMayores: { id: string }[] };
    // Un servicio pedido genera un aviso para cada parte
    const creado = await fetch(`${URL_DEL_BACKEND}/servicios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Seniory-BFF": BFF, "X-Cliente-IP": cuenta.ip, Cookie: familia.cookie, "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        adultoMayorId: perfil.adultosMayores[0]?.id,
        cuidadorId: cuidador.cuidadorId,
        fecha: sumarDias(ahoraEnColombia().hoy, 95),
        jornada: "tarde",
        horas: 1,
        medioDePago: "pasarela",
      }),
    });
    expect(creado.status).toBe(201);
  }, 60_000);

  it("sin sesión no hay campana", async () => {
    const respuesta = await pedir("/notificaciones", { ip: "203.0.113.9" });

    expect(respuesta.status).toBe(401);
  });

  it("la familia y el cuidador reciben cada uno el SUYO, con la forma que la pantalla espera", async () => {
    const dela = await esperarQue(async () => {
      const pagina = await avisosDe(familia);
      return pagina.notificaciones.length > 0 ? pagina : null;
    }, "llegara el aviso a la familia");
    const delCuidadorPagina = await esperarQue(async () => {
      const pagina = await avisosDe(delCuidador);
      return pagina.notificaciones.some((a) => a.tipo === "servicio_solicitado:cuidador") ? pagina : null;
    }, "llegara el aviso al cuidador");

    expect(Object.keys(dela).sort()).toEqual(["notificaciones", "siguiente"]);
    const aviso = dela.notificaciones[0] as Aviso;
    expect(Object.keys(aviso).sort()).toEqual(["creadaEn", "cuerpo", "id", "prioridad", "tipo", "titulo"]);
    expect(aviso.tipo).toBe("servicio_solicitado:familia");
    expect(aviso.prioridad).toBe("normal");
    expect(new Date(aviso.creadaEn).toISOString()).toBe(aviso.creadaEn);
    expect(delCuidadorPagina.notificaciones.map((a) => a.tipo)).toContain("servicio_solicitado:cuidador");
    // Cada parte con su texto: el de la familia nunca aparece en la campana del cuidador
    expect(delCuidadorPagina.notificaciones.map((a) => a.tipo)).not.toContain("servicio_solicitado:familia");
  });

  it("alguien sin relación no ve ningún aviso ajeno", async () => {
    const pagina = await avisosDe(ajena);

    expect(pagina.notificaciones.map((a) => a.tipo)).not.toContain("servicio_solicitado:familia");
    expect(pagina.notificaciones.map((a) => a.tipo)).not.toContain("servicio_solicitado:cuidador");
  });

  it("el cuidador verificado recibe su aviso de bienvenida (el más antiguo) y se pagina con cursor", async () => {
    const todos = await esperarQue(async () => {
      const pagina = await avisosDe(delCuidador);
      return pagina.notificaciones.length >= 2 ? pagina : null;
    }, "el cuidador tuviera dos avisos");
    const fechas = todos.notificaciones.map((a) => a.creadaEn);
    expect([...fechas].sort().reverse()).toEqual(fechas);

    const primera = await avisosDe(delCuidador, "?limite=1");
    expect(primera.notificaciones).toHaveLength(1);
    expect(primera.siguiente).toMatch(/^[A-Za-z0-9_-]+$/);
    const segunda = await avisosDe(delCuidador, `?limite=1&cursor=${primera.siguiente}`);
    expect(segunda.notificaciones).toHaveLength(1);
    expect(segunda.notificaciones[0]?.id).not.toBe(primera.notificaciones[0]?.id);
    expect(segunda.notificaciones[0]?.id).toBe(todos.notificaciones[1]?.id);
  });

  it("rechaza límites y cursores inválidos, y un destinatario que llegue de afuera", async () => {
    expect((await llamar(familia, "/notificaciones?limite=0")).status).toBe(400);
    expect((await llamar(familia, "/notificaciones?limite=51")).status).toBe(400);
    expect((await llamar(familia, "/notificaciones?cursor=no-valido")).status).toBe(400);
    expect((await llamar(familia, "/notificaciones?destinatarioId=00000000-0000-4000-8000-000000000000")).status).toBe(400);
  });
});
