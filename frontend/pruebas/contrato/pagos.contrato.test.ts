// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ahoraEnColombia, sumarDias } from "../../lib/fecha-colombia";
import {
  abrirSesion,
  asegurarPaqueteDePrueba,
  backendDisponible,
  crearCuenta,
  crearCuidadorVerificado,
  enviarAvisoDePago,
  esperarQue,
  hayAdministradorDePrueba,
  hayPasarelaDePrueba,
  pedir,
  URL_DEL_BACKEND,
  type CuentaDePrueba,
  type CuidadorDePrueba,
} from "../soporte/backend-local";

// Contrato de Pagos (INTEGRACION §6) contra el backend local real y su pasarela SIMULADA: el cobro nace cuando el
// cuidador acepta, y un pago pasa a aprobado SOLO con el aviso firmado de la pasarela. Sin backend, administrador de
// prueba o secreto de la pasarela, se omite.

const disponible = (await backendDisponible()) && hayAdministradorDePrueba && hayPasarelaDePrueba;

const CAMPOS_DEL_PAGO = ["concepto", "creadoEn", "estado", "id", "medio", "montoTotal", "paqueteCodigo", "servicioId", "venceEn"];

interface Pago {
  id: string;
  concepto: string;
  servicioId: string | null;
  paqueteCodigo: string | null;
  medio: string;
  montoTotal: number;
  estado: string;
  venceEn: string | null;
  [clave: string]: unknown;
}

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

async function conClave(ruta: string, f: Familia, cuerpo: object, clave = randomUUID()) {
  return fetch(`${URL_DEL_BACKEND}${ruta}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Seniory-BFF": process.env.SENIORY_BFF_SECRETO ?? "",
      "X-Cliente-IP": f.cuenta.ip,
      Cookie: f.cookie,
      "Idempotency-Key": clave,
    },
    body: JSON.stringify(cuerpo),
  });
}

describe.skipIf(!disponible)("contrato de Pagos con el backend local", () => {
  let cuidador: CuidadorDePrueba;
  let cookieDelCuidador: string;
  let dia = 1;
  const diaLibre = () => sumarDias(ahoraEnColombia().hoy, 40 + dia++);

  beforeAll(async () => {
    cuidador = await crearCuidadorVerificado({ tarifaHora: 20_000 });
    cookieDelCuidador = await abrirSesion(cuidador.cuentaDeAcceso);
  }, 60_000);

  async function servicioAceptado(f: Familia, medioDePago: "pasarela" | "bolsa" = "pasarela") {
    const creado = await conClave("/servicios", f, {
      adultoMayorId: f.adultoMayorId,
      cuidadorId: cuidador.cuidadorId,
      fecha: diaLibre(),
      jornada: "tarde",
      horas: 2,
      medioDePago,
    });
    expect(creado.status, await creado.clone().text()).toBe(201);
    const { servicio } = (await creado.json()) as { servicio: { id: string } };
    const aceptado = await pedir(`/servicios/${servicio.id}/aceptar`, { metodo: "POST", cookie: cookieDelCuidador, ip: cuidador.cuentaDeAcceso.ip });
    expect(aceptado.status).toBe(200);
    return servicio.id;
  }

  const misPagos = async (f: Familia) => ((await (await pedir("/pagos", { cookie: f.cookie, ip: f.cuenta.ip })).json()) as { pagos: Pago[] }).pagos;
  const pagoDe = (f: Familia, servicioId: string) => esperarQue(async () => (await misPagos(f)).find((p) => p.servicioId === servicioId), "el cobro del servicio existiera");

  it("al aceptar el cuidador nace UN pago pendiente por el total, con la vista de la familia (sin el pago al cuidador)", async () => {
    const familia = await nuevaFamilia();
    const servicioId = await servicioAceptado(familia);

    const pago = await pagoDe(familia, servicioId);

    expect(Object.keys(pago).sort()).toEqual(CAMPOS_DEL_PAGO);
    expect(pago).toMatchObject({ estado: "pendiente", medio: "pasarela", montoTotal: 43_200, servicioId, paqueteCodigo: null });
    expect(typeof pago.venceEn).toBe("string");
    expect(JSON.stringify(pago)).not.toMatch(/pagoProfesional|ingreso|referencia|proveedor/i);
    expect((await misPagos(familia)).filter((p) => p.servicioId === servicioId)).toHaveLength(1);
  }, 40_000);

  it("el enlace de pago se pide a la pasarela y pedirlo dos veces devuelve el mismo cobro; el pago de otra familia es un 404", async () => {
    const familia = await nuevaFamilia();
    const pago = await pagoDe(familia, await servicioAceptado(familia));

    const uno = await pedir(`/pagos/${pago.id}/enlace`, { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip });
    const dos = await pedir(`/pagos/${pago.id}/enlace`, { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip });

    expect(uno.status).toBe(200);
    const a = (await uno.json()) as { urlDePago: string; venceEn: string };
    expect(Object.keys(a).sort()).toEqual(["urlDePago", "venceEn"]);
    expect(a.urlDePago).toMatch(/^https?:\/\//);
    expect(((await dos.json()) as { urlDePago: string }).urlDePago).toBe(a.urlDePago);

    const ajena = await nuevaFamilia();
    expect((await pedir(`/pagos/${pago.id}/enlace`, { metodo: "POST", cookie: ajena.cookie, ip: ajena.cuenta.ip })).status).toBe(404);
  }, 40_000);

  it("un pago solo se aprueba con el aviso FIRMADO de la pasarela: sin firma válida (401) no pasa nada; con ella, aprobado", async () => {
    const familia = await nuevaFamilia();
    const pago = await pagoDe(familia, await servicioAceptado(familia));

    const falso = await enviarAvisoDePago("pago.aprobado", pago, { firmaValida: false });
    expect(falso.status).toBe(401);
    expect((await misPagos(familia)).find((p) => p.id === pago.id)?.estado).toBe("pendiente");

    const bueno = await enviarAvisoDePago("pago.aprobado", pago);
    expect(bueno.status).toBe(200);
    expect(((await bueno.json()) as { resultado: string }).resultado).toBeDefined();
    expect((await misPagos(familia)).find((p) => p.id === pago.id)?.estado).toBe("aprobado");

    // El mismo aviso repetido (la pasarela reintenta) no hace nada más y se confirma igual.
    expect((await enviarAvisoDePago("pago.aprobado", pago, { idEvento: "mismo-evento" })).status).toBe(200);
    expect((await enviarAvisoDePago("pago.aprobado", pago, { idEvento: "mismo-evento" })).status).toBe(200);
  }, 40_000);

  it("un aviso con otro monto se confirma sin aplicarlo: el pago sigue pendiente", async () => {
    const familia = await nuevaFamilia();
    const pago = await pagoDe(familia, await servicioAceptado(familia));

    const respuesta = await enviarAvisoDePago("pago.aprobado", { id: pago.id, montoTotal: 1 });

    expect(respuesta.status).toBe(200);
    expect((await misPagos(familia)).find((p) => p.id === pago.id)?.estado).toBe("pendiente");
  }, 40_000);

  it("cancelar un servicio ya pagado devuelve el dinero: el pago termina reembolsado", async () => {
    const familia = await nuevaFamilia();
    const servicioId = await servicioAceptado(familia);
    const pago = await pagoDe(familia, servicioId);
    await enviarAvisoDePago("pago.aprobado", pago);

    const cancelado = await pedir(`/servicios/${servicioId}/cancelar`, { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip });
    expect(cancelado.status).toBe(200);

    await esperarQue(async () => (await misPagos(familia)).find((p) => p.id === pago.id)?.estado === "reembolsado", "el pago quedara reembolsado");
  }, 40_000);

  it("cancelar un servicio sin pagar cierra el pago sin reembolso", async () => {
    const familia = await nuevaFamilia();
    const servicioId = await servicioAceptado(familia);
    const pago = await pagoDe(familia, servicioId);

    await pedir(`/servicios/${servicioId}/cancelar`, { metodo: "POST", cookie: familia.cookie, ip: familia.cuenta.ip });

    const cerrado = await esperarQue(async () => (await misPagos(familia)).find((p) => p.id === pago.id && p.estado !== "pendiente"), "el pago dejara de estar pendiente");
    expect(["expirado", "rechazado"]).toContain(cerrado.estado);
  }, 40_000);

  it("el cuidador sin servicios terminados no tiene liquidaciones, y la familia no puede pedirlas", async () => {
    const mia = await pedir("/liquidaciones", { cookie: cookieDelCuidador, ip: cuidador.cuentaDeAcceso.ip });
    expect(mia.status).toBe(200);
    expect(await mia.json()).toEqual({ liquidaciones: [] });

    const familia = await nuevaFamilia();
    expect((await pedir("/liquidaciones", { cookie: familia.cookie, ip: familia.cuenta.ip })).status).toBe(403);
  });

  describe("la bolsa de horas", () => {
    let codigo: string | null = null;
    beforeAll(async () => {
      codigo = await asegurarPaqueteDePrueba();
    });

    it("el catálogo es público y trae solo lo aprobado (sin precios inventados)", async () => {
      const respuesta = await pedir("/catalogo/bolsas");

      expect(respuesta.status).toBe(200);
      const { paquetes } = (await respuesta.json()) as { paquetes: Record<string, unknown>[] };
      for (const paquete of paquetes) {
        expect(Object.keys(paquete).sort()).toEqual(["codigo", "credito", "descuento", "horasReferencia", "precio"]);
      }
      if (codigo !== null) expect(paquetes.map((p) => p.codigo)).toContain(codigo);
    });

    it("una bolsa nueva está en cero, y la compra: pendiente hasta el aviso firmado; recién entonces se acredita; reintentar no duplica", async () => {
      if (codigo === null) return;
      const familia = await nuevaFamilia();
      const bolsa = async () => ((await (await pedir("/bolsa", { cookie: familia.cookie, ip: familia.cuenta.ip })).json()) as { bolsa: { saldoDisponible: number; saldoReservado: number; movimientos: unknown[] } }).bolsa;
      expect(await bolsa()).toEqual({ saldoDisponible: 0, saldoReservado: 0, movimientos: [] });

      const clave = randomUUID();
      const compra = await conClave("/bolsa/compras", familia, { paquete: codigo }, clave);
      expect(compra.status).toBe(201);
      const { pago, urlDePago } = (await compra.json()) as { pago: Pago; urlDePago: string | null };
      expect(pago).toMatchObject({ estado: "pendiente", paqueteCodigo: codigo, montoTotal: 194_400, servicioId: null });
      expect(urlDePago).toMatch(/^https?:\/\//);
      expect((await bolsa()).saldoDisponible).toBe(0);

      const repetida = await conClave("/bolsa/compras", familia, { paquete: codigo }, clave);
      expect(repetida.status).toBe(200);
      expect(((await repetida.json()) as { pago: Pago }).pago.id).toBe(pago.id);

      expect((await enviarAvisoDePago("pago.aprobado", pago)).status).toBe(200);
      const despues = await esperarQue(async () => ((await bolsa()).saldoDisponible > 0 ? await bolsa() : null), "la bolsa se acreditara");
      // Se acredita el CRÉDITO del paquete (con su descuento), no solo lo que se pagó.
      expect(despues.saldoDisponible).toBe(216_000);
      expect(despues.movimientos).toHaveLength(1);
    }, 40_000);

    it("la misma clave con otro paquete es un conflicto; un paquete que no existe, un error", async () => {
      if (codigo === null) return;
      const familia = await nuevaFamilia();
      const clave = randomUUID();
      expect((await conClave("/bolsa/compras", familia, { paquete: codigo }, clave)).status).toBe(201);

      expect((await conClave("/bolsa/compras", familia, { paquete: "prueba-5h" }, clave)).status).toBe(409);
      expect([400, 404, 422]).toContain((await conClave("/bolsa/compras", familia, { paquete: "no-existe-123" })).status);
    }, 40_000);

    it("pedir un servicio con la bolsa exige saldo desde el principio; con saldo, el pago nace aprobado y el saldo se aparta", async () => {
      if (codigo === null) return;
      const familia = await nuevaFamilia();
      const sinSaldo = await conClave("/servicios", familia, {
        adultoMayorId: familia.adultoMayorId, cuidadorId: cuidador.cuidadorId, fecha: diaLibre(), jornada: "tarde", horas: 1, medioDePago: "bolsa",
      });
      expect(sinSaldo.status).toBe(422);
      expect(((await sinSaldo.json()) as { codigo: string }).codigo).toBe("bolsa.saldo_insuficiente");

      const compra = (await (await conClave("/bolsa/compras", familia, { paquete: codigo })).json()) as { pago: Pago };
      await enviarAvisoDePago("pago.aprobado", compra.pago);
      await esperarQue(async () => ((await (await pedir("/bolsa", { cookie: familia.cookie, ip: familia.cuenta.ip })).json()) as { bolsa: { saldoDisponible: number } }).bolsa.saldoDisponible > 0, "la bolsa se acreditara");

      const servicioId = await servicioAceptado(familia, "bolsa");
      const pago = await pagoDe(familia, servicioId);
      expect(pago).toMatchObject({ medio: "bolsa", estado: "aprobado", montoTotal: 43_200 });
      const { bolsa } = (await (await pedir("/bolsa", { cookie: familia.cookie, ip: familia.cuenta.ip })).json()) as { bolsa: { saldoDisponible: number; saldoReservado: number } };
      expect(bolsa).toMatchObject({ saldoDisponible: 216_000 - 43_200, saldoReservado: 43_200 });
    }, 60_000);
  });
});
