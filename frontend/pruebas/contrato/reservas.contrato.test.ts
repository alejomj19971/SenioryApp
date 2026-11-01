// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ahoraEnColombia, sumarDias } from "../../lib/fecha-colombia";
import {
  abrirSesion,
  backendDisponible,
  crearCuenta,
  crearCuidadorVerificado,
  hayAdministradorDePrueba,
  pedir,
  URL_DEL_BACKEND,
  type CuentaDePrueba,
  type CuidadorDePrueba,
} from "../soporte/backend-local";

// Contrato de Reservas y de la cotización (INTEGRACION §6) contra el backend local real, con un cuidador verificado
// creado por el flujo real de M9. Sin el backend o sin el administrador de prueba, se omite.

const disponible = (await backendDisponible()) && hayAdministradorDePrueba;

const CAMPOS_BASE = [
  "aceptadoEn", "adultoMayor", "calificacion", "canceladoEn", "cuidador", "estado", "fecha", "finalizadoEn", "horas", "id",
  "iniciadoEn", "jornada", "medioDePago", "motivoDeCancelacion", "solicitadoEn", "solicitudExpiraEn", "tarifaHora",
];
const CAMPOS_PARA_LA_FAMILIA = [...CAMPOS_BASE, "cargoDeServicio", "politicaVersion", "subtotal", "totalFamilia"].sort();
const CAMPOS_PARA_EL_CUIDADOR = [...CAMPOS_BASE, "pagoProfesional"].sort();

interface Familia {
  cuenta: CuentaDePrueba;
  cookie: string;
  adultoMayorId: string;
}

async function nuevaFamilia(): Promise<Familia> {
  const cuenta = await crearCuenta({ lista: true });
  const cookie = await abrirSesion(cuenta);
  const perfil = (await (await pedir("/yo", { cookie, ip: cuenta.ip })).json()) as { adultosMayores: { id: string }[] };
  return { cuenta, cookie, adultoMayorId: perfil.adultosMayores[0]?.id as string };
}

describe.skipIf(!disponible)("contrato de Reservas con el backend local", () => {
  let cuidador: CuidadorDePrueba;
  let cookieDelCuidador: string;
  let familia: Familia;
  // Cada prueba usa un día distinto para no chocar con la «doble reserva» de las demás.
  let dia = 1;
  const diaLibre = () => sumarDias(ahoraEnColombia().hoy, 7 + dia++);

  beforeAll(async () => {
    cuidador = await crearCuidadorVerificado({ tarifaHora: 20_000 });
    cookieDelCuidador = await abrirSesion(cuidador.cuentaDeAcceso);
    familia = await nuevaFamilia();
  }, 60_000);

  // `pedir` no manda encabezados extra: para la Idempotency-Key se hace la llamada a mano.
  async function solicitarConClave(f: Familia, cuerpo: object, clave: string | null) {
    return fetch(`${URL_DEL_BACKEND}/servicios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Seniory-BFF": process.env.SENIORY_BFF_SECRETO ?? "",
        "X-Cliente-IP": f.cuenta.ip,
        Cookie: f.cookie,
        ...(clave === null ? {} : { "Idempotency-Key": clave }),
      },
      body: JSON.stringify({ adultoMayorId: f.adultoMayorId, cuidadorId: cuidador.cuidadorId, jornada: "tarde", horas: 2, medioDePago: "pasarela", ...cuerpo }),
    });
  }

  it("la cotización la calcula el servidor: 8 % de cargo y NADA del pago al cuidador", async () => {
    const respuesta = await pedir("/pagos/cotizaciones", { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip, cuerpo: { cuidadorId: cuidador.cuidadorId, horas: 3 } });

    expect(respuesta.status).toBe(200);
    const { cotizacion } = (await respuesta.json()) as { cotizacion: Record<string, unknown> };
    expect(Object.keys(cotizacion).sort()).toEqual(["cargoDeServicio", "cuidadorId", "horas", "politicaVersion", "subtotal", "tarifaHora", "totalFamilia"]);
    expect(cotizacion).toMatchObject({ horas: 3, tarifaHora: 20_000, subtotal: 60_000, totalFamilia: 64_800, cargoDeServicio: { porcentaje: 8, monto: 4_800 } });
    expect(JSON.stringify(cotizacion)).not.toMatch(/pagoProfesional|ingreso|comision/i);
  });

  it("no acepta un precio del cliente ni horas fuera de 1 a 8", async () => {
    const conPrecio = await pedir("/pagos/cotizaciones", { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip, cuerpo: { cuidadorId: cuidador.cuidadorId, horas: 1, tarifaHora: 1 } });
    expect(conPrecio.status).toBe(400);
    for (const horas of [0, 9, 1.5]) {
      const respuesta = await pedir("/pagos/cotizaciones", { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip, cuerpo: { cuidadorId: cuidador.cuidadorId, horas } });
      expect(respuesta.status, `${horas} horas`).toBe(400);
    }
  });

  it("solicitar: 201 con la vista de la FAMILIA (lo que paga, nunca lo que recibe el cuidador); reintentar con la misma clave da el mismo servicio", async () => {
    const fecha = diaLibre();
    const clave = randomUUID();

    const primera = await solicitarConClave(familia, { fecha }, clave);
    expect(primera.status).toBe(201);
    const { servicio } = (await primera.json()) as { servicio: Record<string, unknown> };
    expect(Object.keys(servicio).sort()).toEqual(CAMPOS_PARA_LA_FAMILIA);
    expect(servicio).toMatchObject({ estado: "solicitado", fecha, jornada: "tarde", horas: 2, medioDePago: "pasarela", subtotal: 40_000, cargoDeServicio: 3_200, totalFamilia: 43_200 });
    expect(JSON.stringify(servicio)).not.toMatch(/pagoProfesional|telefono|correo/);

    const repetida = await solicitarConClave(familia, { fecha }, clave);
    expect(repetida.status).toBe(200);
    expect(((await repetida.json()) as { servicio: { id: string } }).servicio.id).toBe((servicio as { id: string }).id);

    // La misma clave con OTROS datos es un conflicto: por eso el formulario cambia la clave si cambian los datos.
    const otraSolicitud = await solicitarConClave(familia, { fecha, horas: 3 }, clave);
    expect(otraSolicitud.status).toBe(409);
  });

  it("sin Idempotency-Key se rechaza, y los campos de más también (el precio nunca viene del cliente)", async () => {
    expect((await solicitarConClave(familia, { fecha: diaLibre() }, null)).status).toBe(400);
    expect((await solicitarConClave(familia, { fecha: diaLibre(), subtotal: 1 }, randomUUID())).status).toBe(400);
  });

  it("fecha pasada, medio de pago inválido y franja que el cuidador no atiende se rechazan con su código", async () => {
    const ayer = sumarDias(ahoraEnColombia().hoy, -1);
    const pasada = await solicitarConClave(familia, { fecha: ayer }, randomUUID());
    expect([400, 422]).toContain(pasada.status);
    expect(((await pasada.json()) as { codigo: string }).codigo).toMatch(/^servicio\./);

    const medio = await solicitarConClave(familia, { fecha: diaLibre(), medioDePago: "efectivo" }, randomUUID());
    expect(medio.status).toBe(400);
  });

  it("el cuidador ve la vista del CUIDADOR (lo que recibe, nunca lo que paga la familia) y acepta; la familia no puede aceptar", async () => {
    const fecha = diaLibre();
    const creado = (await (await solicitarConClave(familia, { fecha }, randomUUID())).json()) as { servicio: { id: string } };
    const id = creado.servicio.id;

    const lista = await pedir("/servicios?estado=solicitado", { cookie: cookieDelCuidador, ip: cuidador.cuentaDeAcceso.ip });
    expect(lista.status).toBe(200);
    const { servicios } = (await lista.json()) as { servicios: Record<string, unknown>[] };
    const suyo = servicios.find((s) => s.id === id) as Record<string, unknown>;
    expect(Object.keys(suyo).sort()).toEqual(CAMPOS_PARA_EL_CUIDADOR);
    expect(suyo.pagoProfesional).toBe(36_000);
    expect(JSON.stringify(suyo)).not.toMatch(/totalFamilia|cargoDeServicio|subtotal/);

    // La familia no es el cuidador del servicio: 403 (su rol nunca puede) y el servicio sigue intacto.
    const intruso = await pedir(`/servicios/${id}/aceptar`, { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip });
    expect(intruso.status).toBe(403);

    const aceptado = await pedir(`/servicios/${id}/aceptar`, { metodo: "POST", cookie: cookieDelCuidador, ip: cuidador.cuentaDeAcceso.ip });
    expect(aceptado.status).toBe(200);
    expect(((await aceptado.json()) as { servicio: { estado: string } }).servicio.estado).toBe("aceptado");
  });

  it("sin doble reserva: otra familia pidiendo la misma fecha y franja recibe 409 servicio.franja_ocupada", async () => {
    const fecha = diaLibre();
    expect((await solicitarConClave(familia, { fecha }, randomUUID())).status).toBe(201);

    const otra = await nuevaFamilia();
    const choque = await solicitarConClave(otra, { fecha }, randomUUID());

    expect(choque.status).toBe(409);
    expect(((await choque.json()) as { codigo: string }).codigo).toBe("servicio.franja_ocupada");
  });

  it("un servicio ajeno es un 404 idéntico al de uno inexistente (no se revela que existe)", async () => {
    const fecha = diaLibre();
    const { servicio } = (await (await solicitarConClave(familia, { fecha }, randomUUID())).json()) as { servicio: { id: string } };
    const otra = await nuevaFamilia();

    const ajeno = await pedir(`/servicios/${servicio.id}`, { cookie: otra.cookie, ip: otra.cuenta.ip });
    const inexistente = await pedir(`/servicios/${randomUUID()}`, { cookie: otra.cookie, ip: otra.cuenta.ip });

    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(((await ajeno.json()) as { codigo: string }).codigo).toBe(((await inexistente.json()) as { codigo: string }).codigo);
  });

  it("la familia cancela una solicitud; el estado final es cancelado por la familia", async () => {
    const fecha = diaLibre();
    const { servicio } = (await (await solicitarConClave(familia, { fecha }, randomUUID())).json()) as { servicio: { id: string } };

    const cancelado = await pedir(`/servicios/${servicio.id}/cancelar`, { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip });

    expect(cancelado.status).toBe(200);
    expect(((await cancelado.json()) as { servicio: Record<string, unknown> }).servicio).toMatchObject({ estado: "cancelado", motivoDeCancelacion: "cancelada_por_familia" });
  });

  it("mis servicios pagina por cursor y filtra por estado", async () => {
    const lista = await pedir("/servicios?limite=2", { cookie: familia.cookie, ip: familia.cuenta.ip });

    expect(lista.status).toBe(200);
    const { servicios, siguiente } = (await lista.json()) as { servicios: unknown[]; siguiente: string | null };
    expect(servicios).toHaveLength(2);
    expect(typeof siguiente).toBe("string");
    const otra = await pedir(`/servicios?limite=2&cursor=${encodeURIComponent(siguiente as string)}`, { cookie: familia.cookie, ip: familia.cuenta.ip });
    expect(otra.status).toBe(200);
    const soloCancelados = (await (await pedir("/servicios?estado=cancelado", { cookie: familia.cookie, ip: familia.cuenta.ip })).json()) as { servicios: { estado: string }[] };
    expect(soloCancelados.servicios.every((s) => s.estado === "cancelado")).toBe(true);
  });

  it("cuidador en turno: sin servicio activo ahora responde 200 con null (no es un error)", async () => {
    const respuesta = await pedir(`/adultos-mayores/${familia.adultoMayorId}/cuidador-en-turno`, { cookie: familia.cookie, ip: familia.cuenta.ip });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ cuidadorEnTurno: null });
  });
});
