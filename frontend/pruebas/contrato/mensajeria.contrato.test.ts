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
  type CuidadorDePrueba,
} from "../soporte/backend-local";

// Contrato de Mensajería (INTEGRACION §6) contra el backend local real: solo las dos partes de un servicio vivo, texto
// plano, reenvíos sin duplicar y eventos en vivo (SSE). Sin backend o sin el administrador de prueba, se omite.

const disponible = (await backendDisponible()) && hayAdministradorDePrueba;
const BFF = process.env.SENIORY_BFF_SECRETO ?? "";

interface Persona {
  cuenta: CuentaDePrueba;
  cookie: string;
}
interface Mensaje {
  id: string;
  conversacionId: string;
  autor: "yo" | "otro";
  texto: string;
  enviadoEn: string;
  idDeCliente?: string;
}
interface EventoSse {
  id: string;
  evento: string;
  datos: string;
}

async function conSesion(cuenta: CuentaDePrueba): Promise<Persona> {
  return { cuenta, cookie: await abrirSesion(cuenta) };
}

// Lee un flujo SSE hasta que `parar` lo diga o pasen `milisegundos`; devuelve los eventos recibidos.
async function leerFlujo(
  persona: Persona,
  opciones: { ultimoEvento?: string; milisegundos: number; parar?: (eventos: EventoSse[]) => boolean },
) {
  const control = new AbortController();
  const respuesta = await fetch(`${URL_DEL_BACKEND}/mensajeria/eventos`, {
    headers: {
      Accept: "text/event-stream",
      "X-Seniory-BFF": BFF,
      "X-Cliente-IP": persona.cuenta.ip,
      Cookie: persona.cookie,
      ...(opciones.ultimoEvento === undefined ? {} : { "Last-Event-ID": opciones.ultimoEvento }),
    },
    signal: control.signal,
  });
  const eventos: EventoSse[] = [];
  const limite = setTimeout(() => control.abort(), opciones.milisegundos);
  try {
    if (!respuesta.ok || respuesta.body === null) return { respuesta, eventos };
    const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
    let resto = "";
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += value;
      const bloques = resto.split("\n\n");
      resto = bloques.pop() ?? "";
      for (const bloque of bloques) {
        const campo = (nombre: string) => bloque.split("\n").find((linea) => linea.startsWith(`${nombre}:`))?.slice(nombre.length + 1).trim() ?? "";
        eventos.push({ id: campo("id"), evento: campo("event"), datos: campo("data") });
      }
      if (opciones.parar?.(eventos) === true) break;
    }
  } catch {
    // Cortado por el tiempo: se devuelve lo recibido.
  } finally {
    clearTimeout(limite);
    control.abort();
  }
  return { respuesta, eventos };
}

describe.skipIf(!disponible)("contrato de Mensajería con el backend local", () => {
  let cuidador: CuidadorDePrueba;
  let delCuidador: Persona;
  let familia: Persona;
  let adultoMayorId: string;
  let conversacionId: string;
  let servicioId: string;

  const llamar = (persona: Persona, ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}) =>
    pedir(ruta, { cookie: persona.cookie, ip: persona.cuenta.ip, ...opciones });
  const enviar = (persona: Persona, texto: string, idDeCliente = randomUUID(), conversacion = conversacionId) =>
    llamar(persona, `/conversaciones/${conversacion}/mensajes`, { metodo: "POST", cuerpo: { texto, idDeCliente } });

  beforeAll(async () => {
    cuidador = await crearCuidadorVerificado();
    delCuidador = await conSesion(cuidador.cuentaDeAcceso);
    const cuenta = await crearCuenta({ lista: true });
    familia = await conSesion(cuenta);
    const perfil = (await (await llamar(familia, "/yo")).json()) as { adultosMayores: { id: string }[] };
    adultoMayorId = perfil.adultosMayores[0]?.id as string;
    // Un servicio vivo (solicitado) entre las dos partes: lo que permite abrir y escribir.
    const creado = await fetch(`${URL_DEL_BACKEND}/servicios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Seniory-BFF": BFF, "X-Cliente-IP": cuenta.ip, Cookie: familia.cookie, "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ adultoMayorId, cuidadorId: cuidador.cuidadorId, fecha: sumarDias(ahoraEnColombia().hoy, 90), jornada: "tarde", horas: 1, medioDePago: "pasarela" }),
    });
    expect(creado.status).toBe(201);
    servicioId = ((await creado.json()) as { servicio: { id: string } }).servicio.id;
  }, 60_000);

  it("sin un servicio vivo no se puede abrir una conversación; con él, la familia abre y reabrir devuelve la misma", async () => {
    const ajena = await conSesion(await crearCuenta({ lista: true }));
    const sinServicio = await llamar(ajena, "/conversaciones", { metodo: "POST", cuerpo: { cuidadorId: cuidador.cuidadorId } });
    expect([403, 404, 422]).toContain(sinServicio.status);

    const abierta = await llamar(familia, "/conversaciones", { metodo: "POST", cuerpo: { cuidadorId: cuidador.cuidadorId } });
    expect(abierta.status).toBe(201);
    const { conversacion } = (await abierta.json()) as { conversacion: Record<string, unknown> };
    expect(Object.keys(conversacion).sort()).toEqual(["id", "otraParte", "puedeEscribir", "ultimoMensajeEn"]);
    expect(Object.keys(conversacion.otraParte as object).sort()).toEqual(["fotoUrl", "nombre"]);
    expect(conversacion).toMatchObject({ puedeEscribir: true, ultimoMensajeEn: null });
    conversacionId = conversacion.id as string;

    const otraVez = await llamar(familia, "/conversaciones", { metodo: "POST", cuerpo: { cuidadorId: cuidador.cuidadorId } });
    expect(otraVez.status).toBe(200);
    expect(((await otraVez.json()) as { conversacion: { id: string } }).conversacion.id).toBe(conversacionId);

    // El cuidador no abre conversaciones (solo las familias)
    expect((await llamar(delCuidador, "/conversaciones", { metodo: "POST", cuerpo: { cuidadorId: cuidador.cuidadorId } })).status).toBe(403);
  });

  it("ambas partes ven la conversación con el nombre de la otra y NINGÚN dato de contacto", async () => {
    const suya = (await (await llamar(delCuidador, "/conversaciones")).json()) as { conversaciones: { id: string; otraParte: { nombre: string } }[] };
    const mia = (await (await llamar(familia, "/conversaciones")).json()) as { conversaciones: { id: string; otraParte: { nombre: string } }[] };

    expect(suya.conversaciones.map((c) => c.id)).toContain(conversacionId);
    expect(mia.conversaciones.find((c) => c.id === conversacionId)?.otraParte.nombre).toBe(cuidador.nombre);
    expect(JSON.stringify([suya, mia])).not.toMatch(/telefono|correo|@|\+57/i);
  });

  it("enviar: 201 con el mensaje como «yo» (con su idDeCliente); reenviar el mismo devuelve el mismo, sin duplicar", async () => {
    const idDeCliente = randomUUID();
    const primero = await enviar(familia, "Hola, ¿cómo estás?", idDeCliente);
    expect(primero.status).toBe(201);
    const { mensaje } = (await primero.json()) as { mensaje: Mensaje };
    expect(Object.keys(mensaje).sort()).toEqual(["autor", "conversacionId", "enviadoEn", "id", "idDeCliente", "texto"]);
    expect(mensaje).toMatchObject({ autor: "yo", texto: "Hola, ¿cómo estás?", idDeCliente, conversacionId });

    const repetido = await enviar(familia, "Hola, ¿cómo estás?", idDeCliente);
    expect(repetido.status).toBe(200);
    expect(((await repetido.json()) as { mensaje: Mensaje }).mensaje.id).toBe(mensaje.id);

    const lista = (await (await llamar(familia, `/conversaciones/${conversacionId}/mensajes`)).json()) as { mensajes: Mensaje[] };
    expect(lista.mensajes.filter((m) => m.texto === "Hola, ¿cómo estás?")).toHaveLength(1);
  });

  it("la otra parte lo ve como «otro» y SIN idDeCliente; la lista va del más reciente al más antiguo y se pagina por cursor", async () => {
    for (const texto of ["uno", "dos", "tres"]) expect((await enviar(delCuidador, texto)).status).toBe(201);

    const pagina = await llamar(familia, `/conversaciones/${conversacionId}/mensajes?limite=2`);
    expect(pagina.status).toBe(200);
    const { mensajes, siguiente } = (await pagina.json()) as { mensajes: Mensaje[]; siguiente: string | null };
    expect(mensajes.map((m) => m.texto)).toEqual(["tres", "dos"]);
    expect(mensajes.every((m) => m.autor === "otro")).toBe(true);
    expect(mensajes.some((m) => "idDeCliente" in m)).toBe(false);
    expect(typeof siguiente).toBe("string");

    const anteriores = (await (await llamar(familia, `/conversaciones/${conversacionId}/mensajes?limite=2&antes=${encodeURIComponent(siguiente as string)}`)).json()) as { mensajes: Mensaje[] };
    expect(anteriores.mensajes[0]?.texto).toBe("uno");
  });

  it("el texto es plano de 1 a 1000 caracteres: vacío, solo espacios o demasiado largo se rechazan; un campo de más también", async () => {
    for (const texto of ["", "   ", "\n\n", "x".repeat(1001)]) expect((await enviar(familia, texto)).status, JSON.stringify(texto.slice(0, 5))).toBe(400);
    expect((await enviar(familia, "x".repeat(1000))).status).toBe(201);
    expect((await enviar(familia, "😀".repeat(1000))).status).toBe(201);
    const conRol = await llamar(familia, `/conversaciones/${conversacionId}/mensajes`, { metodo: "POST", cuerpo: { texto: "hola", idDeCliente: randomUUID(), autor: "otro" } });
    expect(conRol.status).toBe(400);
    // Lo escrito se guarda como texto, no se interpreta
    const html = (await (await enviar(familia, '<img src=x onerror="alert(1)">')).json()) as { mensaje: Mensaje };
    expect(html.mensaje.texto).toBe('<img src=x onerror="alert(1)">');
  });

  it("un tercero recibe 404 idéntico al de una conversación inexistente (no se revela que existe)", async () => {
    const otra = await conSesion(await crearCuenta({ lista: true }));

    const ajena = await llamar(otra, `/conversaciones/${conversacionId}/mensajes`);
    const inexistente = await llamar(otra, `/conversaciones/${randomUUID()}/mensajes`);

    expect(ajena.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(((await ajena.json()) as { codigo: string }).codigo).toBe(((await inexistente.json()) as { codigo: string }).codigo);
    expect((await enviar(otra, "intruso")).status).toBe(404);
  });

  it("eventos en vivo: el cuidador recibe el mensaje de la familia con su id como posición, y los latidos no son mensajes", async () => {
    const texto = `en vivo ${randomUUID()}`;
    const flujo = leerFlujo(delCuidador, { milisegundos: 12_000, parar: (eventos) => eventos.some((e) => e.evento === "mensaje" && e.datos.includes(texto)) });
    await new Promise((resolver) => setTimeout(resolver, 700));
    expect((await enviar(familia, texto)).status).toBe(201);

    const { respuesta, eventos } = await flujo;
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toContain("text/event-stream");
    const recibido = eventos.find((e) => e.evento === "mensaje" && e.datos.includes(texto));
    expect(recibido).toBeDefined();
    expect(recibido?.id).not.toBe("");
    expect(JSON.parse(recibido?.datos ?? "{}")).toMatchObject({ autor: "otro", texto, conversacionId });
  }, 30_000);

  it("al reconectar con Last-Event-ID el flujo sigue desde ahí: no se pierde nada (puede repetir: se reconoce por id)", async () => {
    const primera = leerFlujo(delCuidador, { milisegundos: 8_000, parar: (eventos) => eventos.some((e) => e.evento === "mensaje") });
    await new Promise((resolver) => setTimeout(resolver, 600));
    await enviar(familia, "antes de cortar");
    const { eventos: antes } = await primera;
    const ultimo = antes.filter((e) => e.evento === "mensaje").at(-1)?.id as string;
    expect(ultimo).toBeTruthy();

    // Mientras el cuidador estaba desconectado, la familia escribe
    const perdido = `mientras no estabas ${randomUUID()}`;
    await enviar(familia, perdido);

    const { eventos } = await leerFlujo(delCuidador, { ultimoEvento: ultimo, milisegundos: 10_000, parar: (e) => e.some((x) => x.datos.includes(perdido)) });
    expect(eventos.some((e) => e.evento === "mensaje" && e.datos.includes(perdido))).toBe(true);
  }, 40_000);

  it("un Last-Event-ID que no es nuestro da 400 antes de transmitir; sin sesión, 401", async () => {
    const mal = await leerFlujo(delCuidador, { ultimoEvento: "basura!!", milisegundos: 3_000 });
    expect(mal.respuesta.status).toBe(400);

    const sinSesion = await fetch(`${URL_DEL_BACKEND}/mensajeria/eventos`, { headers: { Accept: "text/event-stream" } });
    expect(sinSesion.status).toBe(401);
  });

  it("al terminar el servicio ya no se puede escribir (422) pero SIEMPRE se puede leer, y puedeEscribir pasa a falso", async () => {
    const cancelado = await llamar(familia, `/servicios/${servicioId}/cancelar`, { metodo: "POST" });
    expect(cancelado.status).toBe(200);

    const escribir = await enviar(familia, "¿sigues ahí?");
    expect(escribir.status).toBe(422);
    expect(((await escribir.json()) as { codigo: string }).codigo).toBe("conversacion.sin_servicio_activo");
    const lectura = await llamar(familia, `/conversaciones/${conversacionId}/mensajes`);
    expect(lectura.status).toBe(200);
    expect(((await lectura.json()) as { mensajes: unknown[] }).mensajes.length).toBeGreaterThan(0);

    await esperarQue(async () => {
      const { conversaciones } = (await (await llamar(familia, "/conversaciones")).json()) as { conversaciones: { id: string; puedeEscribir: boolean }[] };
      return conversaciones.find((c) => c.id === conversacionId)?.puedeEscribir === false;
    }, "la conversación quedara solo de lectura");
  });
});
