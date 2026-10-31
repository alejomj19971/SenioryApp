import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, inArray } from 'drizzle-orm';
import type { QueryResultRow } from 'pg';
import {
  AUDITORIA,
  type Auditoria,
} from '../../src/compartido/aplicacion/puertos/auditoria.js';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../../src/compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  EMISOR_DE_TOKENS,
  type EmisorDeTokens,
} from '../../src/identidad/aplicacion/puertos/salida/emisor-de-tokens.js';
import type { UsuarioId } from '../../src/identidad/dominio/ids.js';
import type { EventoDeIntegracion } from '../../src/compartido/eventos/evento-de-integracion.js';
import { ContextoTransaccional } from '../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { DespachadorDeEventos } from '../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { RegistroDeManejadores } from '../../src/compartido/infraestructura/outbox/registro-de-manejadores.js';
import { DispersarLiquidaciones } from '../../src/pagos/aplicacion/casos-de-uso/dispersar-liquidaciones.js';
import { ExpirarPagos } from '../../src/pagos/aplicacion/casos-de-uso/expirar-pagos.js';
import {
  DISPERSOR_DE_PAGOS,
  type DispersorDePagos,
} from '../../src/pagos/aplicacion/puertos/salida/dispersor-de-pagos.js';
import { PASARELA_DE_PAGOS } from '../../src/pagos/aplicacion/puertos/salida/pasarela-de-pagos.js';
import {
  REPOSITORIO_LIQUIDACIONES,
  REPOSITORIO_PAGOS,
  type RepositorioLiquidaciones,
  type RepositorioPagos,
} from '../../src/pagos/aplicacion/puertos/salida/repositorios.js';
import { ResolucionDePagos } from '../../src/pagos/aplicacion/servicios/resolucion-de-pagos.js';
import { DispersorSimulado } from '../../src/pagos/infraestructura/salida/dispersion/dispersores.js';
import {
  ENCABEZADO_DE_FIRMA_SIMULADA,
  firmarAvisoSimulado,
  PasarelaSimulada,
} from '../../src/pagos/infraestructura/salida/pasarela/pasarela-simulada.js';
import { liquidacionDeFila } from '../../src/pagos/infraestructura/salida/persistencia/mapeadores.js';
import { liquidaciones } from '../../src/pagos/infraestructura/salida/persistencia/pagos.esquema.js';
import { como, SECRETO_BFF } from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import {
  nuevaFamilia,
  nuevoCuidador,
  type Cuidador,
  type Familia,
} from '../soporte/escenario.js';
import { SECRETO_DE_PASARELA_DE_PRUEBA } from '../soporte/secretos.js';

// M7 (API): el cobro, la bolsa de horas, el reembolso y la liquidación, de punta a punta con la aplicación completa
// y Postgres real. El reloj está en el lunes 10 de junio de 2030 a las 10:00 en Bogotá. El servicio de prueba son
// 2 horas con un cuidador de $20.000/h: la familia paga $43.200, el cuidador recibe $36.000 y la plataforma $7.200.
// La aplicación exige el pago aprobado para iniciar y da 30 minutos para pagar.

const INICIO = '2030-06-10T15:00:00.000Z';
const HOY = '2030-06-10';
const MANANA = '2030-06-11';
const TOTAL = 43_200;
const AL_CUIDADOR = 36_000;
const A_LA_PLATAFORMA = 7_200;
const MINUTOS_PARA_PAGAR = 30;
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

async function uno<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T> {
  const [fila] = await filas<T>(texto, parametros);
  if (fila === undefined) throw new Error(`Sin filas: ${texto}`);
  return fila;
}

const clave = () => `clave-${nuevoId()}`;

interface PagoFila {
  id: string;
  concepto: string;
  estado: string;
  medio: string;
  pagador_id: string;
  monto_total: number;
  pago_profesional: number | null;
  ingreso_plataforma: number | null;
  politica_version: number | null;
  proveedor: string | null;
  referencia_proveedor: string | null;
  aprobado_en: Date | null;
  clave_idempotencia: string;
}

describe('pagos (API)', () => {
  let app: NestExpressApplication;
  let familia: Familia;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: {
        SECRETO_BFF,
        REQUIERE_PAGO_APROBADO: 'true',
        MINUTOS_PARA_PAGAR: String(MINUTOS_PARA_PAGAR),
      },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  // Una familia nueva en cada prueba: Notificaciones limita los avisos normales por persona y hora, y una familia
  // compartida llegaría al tope.
  beforeEach(async () => {
    reloj.fijar(INICIO);
    vi.restoreAllMocks();
    familia = await nuevaFamilia(app);
  });

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────

  const pasarela = () =>
    app.get<PasarelaSimulada>(PASARELA_DE_PAGOS, { strict: false });
  const dispersor = () =>
    app.get<DispersorSimulado>(DISPERSOR_DE_PAGOS, { strict: false });

  // Con la aceptación automática el servicio nace aceptado: no queda ningún momento en que esté «solicitado». Importa
  // porque la base se comparte con otras pruebas, y una que corra la tarea de expiración de solicitudes con su
  // reloj cancelaría un servicio nuestro que justo estuviera esperando respuesta.
  const cuidadorAutomatico = () =>
    nuevoCuidador(app, reloj, { aceptacionAutomatica: true });
  // El cuidador debe aceptar a mano: para las pruebas que necesitan ver el servicio «solicitado».
  const cuidadorManual = () => nuevoCuidador(app, reloj);

  const solicitar = (
    c: Cuidador,
    cambios: Record<string, unknown> = {},
    de: Familia = familia,
  ) =>
    como(app)
      .post('/api/v1/servicios')
      .set('Cookie', de.cookie)
      .set('Idempotency-Key', clave())
      .send({
        adultoMayorId: de.adultoMayorId,
        cuidadorId: c.cuidadorId,
        fecha: MANANA,
        jornada: 'manana',
        horas: 2,
        medioDePago: 'pasarela',
        ...cambios,
      });

  async function crearServicio(
    c: Cuidador,
    cambios: Record<string, unknown> = {},
    de: Familia = familia,
  ): Promise<string> {
    const respuesta = await solicitar(c, cambios, de);
    expect([200, 201]).toContain(respuesta.status);
    return (respuesta.body as { servicio: { id: string } }).servicio.id;
  }

  const accion = (ruta: string, id: string, cookie: string) =>
    como(app)
      .post(`/api/v1/servicios/${id}/${ruta}`)
      .set('Cookie', cookie)
      .send({});

  // Las entregas en cascada (un manejador publica otro evento) tardan una vuelta cada una.
  async function procesarEventos(): Promise<void> {
    const despachador = app.get(DespachadorDeEventos, { strict: false });
    for (let i = 0; i < 6; i++) await despachador.esperarEntregas();
  }

  const pagoDe = (servicioId: string) =>
    uno<PagoFila>(
      `select id, concepto, estado, medio, pagador_id, monto_total::int as monto_total,
              pago_profesional::int as pago_profesional, ingreso_plataforma::int as ingreso_plataforma,
              politica_version, proveedor, referencia_proveedor, aprobado_en, clave_idempotencia
       from pagos.pagos where servicio_id = $1`,
      [servicioId],
    );

  const pagoPorId = (id: string) =>
    uno<PagoFila>(
      `select id, concepto, estado, medio, pagador_id, monto_total::int as monto_total,
              pago_profesional::int as pago_profesional, ingreso_plataforma::int as ingreso_plataforma,
              politica_version, proveedor, referencia_proveedor, aprobado_en, clave_idempotencia
       from pagos.pagos where id = $1`,
      [id],
    );

  // Los eventos de un tipo que dicen algo de un servicio (o de un pago).
  const eventos = (
    campo: 'servicioId' | 'pagoId',
    valor: string,
    tipo: string,
  ) =>
    filas<{ datos: Record<string, unknown> }>(
      `select datos from compartido.outbox where datos->>'${campo}' = $1 and tipo = $2 order by creado_en`,
      [valor, tipo],
    );

  const servicioDe = (id: string) =>
    uno<{
      estado: string;
      motivo_cancelacion: string | null;
      pagado_en: Date | null;
    }>(
      'select estado, motivo_cancelacion, pagado_en from reservas.servicios where id = $1',
      [id],
    );

  const avisosDe = (servicioId: string, tipo: string) =>
    filas<{ destinatario_id: string; parametros: Record<string, unknown> }>(
      `select destinatario_id, parametros from notificaciones.notificaciones
       where parametros->>'servicioId' = $1 and tipo = $2`,
      [servicioId, tipo],
    );

  // Un servicio aceptado y ya cobrado: el pago queda creado (pendiente, si es con la pasarela).
  async function confirmado(
    c: Cuidador,
    cambios: Record<string, unknown> = {},
    de: Familia = familia,
  ): Promise<{ id: string; pagoId: string }> {
    const id = await crearServicio(c, cambios, de);
    if ((await servicioDe(id)).estado === 'solicitado') {
      const aceptado = await accion('aceptar', id, await c.cookie());
      expect(aceptado.status, JSON.stringify(aceptado.body)).toBe(200);
    }
    await procesarEventos();
    return { id, pagoId: (await pagoDe(id)).id };
  }

  async function cookieDeFamiliaAhora(de: Familia): Promise<string> {
    const emisor = app.get<EmisorDeTokens>(EMISOR_DE_TOKENS, { strict: false });
    const { token } = await emisor.emitirAcceso(
      { id: de.persona.id as UsuarioId, rol: 'familiar' },
      reloj.ahora(),
    );
    return `seniory_acceso=${token}`;
  }

  // El aviso de la pasarela, firmado como lo haría ella.
  const aviso = (
    pagoId: string,
    cambios: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    idEvento: `evt-${nuevoId()}`,
    tipo: 'pago.aprobado',
    referencia: pagoId,
    monto: TOTAL,
    ...cambios,
  });

  const enviarAviso = (
    cuerpo: unknown,
    opciones: { firma?: string | null; proveedor?: string } = {},
  ) => {
    const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const firma =
      opciones.firma === undefined
        ? firmarAvisoSimulado(SECRETO_DE_PASARELA_DE_PRUEBA, Buffer.from(texto))
        : opciones.firma;
    let peticion = como(app)
      .post(`/api/v1/pagos/webhook/${opciones.proveedor ?? 'simulada'}`)
      .set('Content-Type', 'application/json');
    if (firma !== null) {
      peticion = peticion.set(ENCABEZADO_DE_FIRMA_SIMULADA, firma);
    }
    return peticion.send(texto);
  };

  async function aprobarPago(pagoId: string, monto = TOTAL): Promise<void> {
    const respuesta = await enviarAviso(aviso(pagoId, { monto }));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ resultado: 'procesado' });
    await procesarEventos();
  }

  const pedirEnlace = (pagoId: string, cookie: string) =>
    como(app).post(`/api/v1/pagos/${pagoId}/enlace`).set('Cookie', cookie);

  // Corre la tarea que vence los pagos, pero SOLO sobre estos pagos: la base se comparte con otras pruebas.
  function expirarSolo(ids: string[]): ExpirarPagos {
    const base = app.get<RepositorioPagos>(REPOSITORIO_PAGOS, {
      strict: false,
    });
    const soloEstos = Object.create(base, {
      listarPendientesVencidos: {
        value: async (antes: Date) =>
          (await base.listarPendientesVencidos(antes, 10_000)).filter((id) =>
            ids.includes(id),
          ),
      },
    }) as RepositorioPagos;
    return new ExpirarPagos(
      soloEstos,
      pasarela(),
      app.get(ResolucionDePagos, { strict: false }),
      app.get<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO, { strict: false }),
      app.get<Auditoria>(AUDITORIA, { strict: false }),
      reloj,
      MINUTOS_PARA_PAGAR,
    );
  }

  // Corre la tarea que paga al cuidador, pero SOLO sobre estas liquidaciones.
  function dispersarSolo(
    ids: string[],
    con: DispersorDePagos = dispersor(),
  ): DispersarLiquidaciones {
    const contexto = app.get(ContextoTransaccional, { strict: false });
    const base = app.get<RepositorioLiquidaciones>(REPOSITORIO_LIQUIDACIONES, {
      strict: false,
    });
    const soloEstas = Object.create(base, {
      reclamarSiguientePendiente: {
        value: async () => {
          const encontradas = await contexto
            .conexion()
            .select()
            .from(liquidaciones)
            .where(
              and(
                inArray(liquidaciones.id, ids),
                eq(liquidaciones.estado, 'pendiente'),
              ),
            )
            .limit(1)
            .for('update', { skipLocked: true });
          const fila = encontradas[0];
          return fila === undefined ? null : liquidacionDeFila(fila);
        },
      },
    }) as RepositorioLiquidaciones;
    return new DispersarLiquidaciones(
      soloEstas,
      con,
      app.get<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO, { strict: false }),
      app.get<Auditoria>(AUDITORIA, { strict: false }),
      reloj,
    );
  }

  const liquidacionDe = (servicioId: string) =>
    uno<{
      id: string;
      cuidador_id: string;
      monto: number;
      estado: string;
      referencia_dispersion: string | null;
      pagada_en: Date | null;
    }>(
      `select id, cuidador_id, monto::int as monto, estado, referencia_dispersion, pagada_en
       from pagos.liquidaciones where servicio_id = $1`,
      [servicioId],
    );

  // Vuelve a entregar un evento ya procesado a su manejador, como haría el outbox si lo repitiera.
  async function repetirEvento(
    tipo: string,
    nombre: string,
    servicioId: string,
  ): Promise<void> {
    const fila = await uno<{ id: string; datos: unknown }>(
      `select id, datos from compartido.outbox where tipo = $1 and datos->>'servicioId' = $2
       order by creado_en desc limit 1`,
      [tipo, servicioId],
    );
    const manejador = app
      .get(RegistroDeManejadores, { strict: false })
      .para(tipo)
      .find((m) => m.nombre === nombre);
    if (manejador === undefined) throw new Error(`Sin manejador ${nombre}`);
    const evento: EventoDeIntegracion = {
      id: fila.id,
      tipo,
      version: 1,
      ocurridoEn: INICIO,
      idDeCorrelacion: 'prueba',
      datos: fila.datos,
    };
    await manejador.manejar(evento);
  }

  // ─── Bolsa: ayudas ─────────────────────────────────────────────────────────────────────────

  async function nuevoPaquete(
    cambios: Partial<{
      precio: number;
      credito: number;
      descuentoBps: number;
      activo: boolean;
      horas: number;
    }> = {},
  ): Promise<string> {
    const codigo = `prueba-api-${nuevoId().slice(0, 12)}`;
    const precio = cambios.precio ?? 90_000;
    await bd.query(
      `insert into pagos.paquetes_de_bolsa (codigo, horas_referencia, descuento_bps, credito, precio, activo)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        codigo,
        cambios.horas ?? 5,
        cambios.descuentoBps ?? 1000,
        cambios.credito ?? 100_000,
        precio,
        cambios.activo ?? true,
      ],
    );
    return codigo;
  }

  const comprar = (
    cookie: string,
    paquete: unknown,
    llave: string | null = clave(),
  ) => {
    let peticion = como(app)
      .post('/api/v1/bolsa/compras')
      .set('Cookie', cookie);
    if (llave !== null) peticion = peticion.set('Idempotency-Key', llave);
    return peticion.send({ paquete });
  };

  // Le deja saldo a una familia sin pasar por la compra (para probar lo que viene después).
  async function darSaldo(de: Familia, monto: number): Promise<void> {
    await bd.query(
      `insert into pagos.bolsas (id, familiar_id, saldo_disponible) values ($1, $2, $3)
       on conflict (familiar_id) do update set saldo_disponible = excluded.saldo_disponible`,
      [nuevoId(), de.persona.id, monto],
    );
  }

  const saldosDe = async (de: Familia) =>
    uno<{ disponible: number; reservado: number }>(
      `select saldo_disponible::int as disponible, saldo_reservado::int as reservado
       from pagos.bolsas where familiar_id = $1`,
      [de.persona.id],
    );

  const movimientosDe = (de: Familia) =>
    filas<{ tipo: string; delta_disponible: number; delta_reservado: number }>(
      `select m.tipo, m.delta_disponible::int as delta_disponible, m.delta_reservado::int as delta_reservado
       from pagos.movimientos_de_bolsa m join pagos.bolsas b on b.id = m.bolsa_id
       where b.familiar_id = $1 order by m.creado_en, m.id`,
      [de.persona.id],
    );

  // ─── Cobro al confirmarse el servicio ──────────────────────────────────────────────────────
  describe('cobro al confirmarse el servicio', () => {
    it('con la pasarela queda un pago pendiente con el desglose congelado y se avisa a la familia', async () => {
      const c = await cuidadorAutomatico();

      const { id, pagoId } = await confirmado(c);

      expect(await pagoDe(id)).toMatchObject({
        id: pagoId,
        concepto: 'servicio',
        estado: 'pendiente',
        medio: 'pasarela',
        pagador_id: familia.persona.id,
        monto_total: TOTAL,
        pago_profesional: AL_CUIDADOR,
        ingreso_plataforma: A_LA_PLATAFORMA,
        politica_version: 1,
        clave_idempotencia: `servicio:${id}`,
        aprobado_en: null,
      });
      expect(
        await eventos('servicioId', id, 'pagos.pago_requerido'),
      ).toHaveLength(1);
      const avisos = await avisosDe(id, 'pago_requerido:familia');
      expect(avisos.map((a) => a.destinatario_id)).toEqual([
        familia.persona.id,
      ]);
    });

    it('reprocesar el evento no cobra dos veces', async () => {
      const c = await cuidadorAutomatico();
      const { id } = await confirmado(c);

      await repetirEvento(
        'reservas.servicio_confirmado',
        'pagos.cobrar_servicio_confirmado',
        id,
      );

      expect(
        await filas('select id from pagos.pagos where servicio_id = $1', [id]),
      ).toHaveLength(1);
    });

    it('se niega a cobrar si el desglose no coincide con la política de precios', async () => {
      const manejador = app
        .get(RegistroDeManejadores, { strict: false })
        .para('reservas.servicio_confirmado')
        .find((m) => m.nombre === 'pagos.cobrar_servicio_confirmado');
      const servicioId = nuevoId();
      const evento = (totalFamilia: number): EventoDeIntegracion => ({
        id: nuevoId(),
        tipo: 'reservas.servicio_confirmado',
        version: 1,
        ocurridoEn: INICIO,
        idDeCorrelacion: 'prueba',
        datos: {
          servicioId,
          familiarId: familia.persona.id,
          cuidadorId: nuevoId(),
          adultoMayorId: familia.adultoMayorId,
          cobro: {
            medioDePago: 'pasarela',
            horas: 2,
            tarifaHora: 20_000,
            politicaVersion: 1,
            totalFamilia,
            pagoProfesional: AL_CUIDADOR,
          },
        },
      });

      await expect(manejador?.manejar(evento(TOTAL - 1))).rejects.toMatchObject(
        {
          codigo: 'pago.desglose_no_coincide',
        },
      );
      expect(
        await filas('select id from pagos.pagos where servicio_id = $1', [
          servicioId,
        ]),
      ).toEqual([]);
    });

    it('un servicio que se rechaza antes de confirmarse nunca tiene pago', async () => {
      const c = await cuidadorManual();
      const id = await crearServicio(c);
      expect((await accion('rechazar', id, await c.cookie())).status).toBe(200);
      await procesarEventos();

      expect(
        await filas('select id from pagos.pagos where servicio_id = $1', [id]),
      ).toEqual([]);
    });
  });

  // ─── Enlace de pago ────────────────────────────────────────────────────────────────────────
  describe('POST /pagos/:id/enlace', () => {
    it('devuelve el enlace de la pasarela y deja anotado el cobro', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);

      const respuesta = await pedirEnlace(pagoId, familia.cookie);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        urlDePago: expect.stringContaining(pagoId) as string,
        venceEn: '2030-06-10T15:30:00.000Z',
      });
      expect(await pagoPorId(pagoId)).toMatchObject({
        proveedor: 'simulada',
        referencia_proveedor: `sim_${pagoId}`,
        estado: 'pendiente',
      });
    });

    it('pedirlo otra vez devuelve el mismo cobro', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);

      const primero = await pedirEnlace(pagoId, familia.cookie);
      const segundo = await pedirEnlace(pagoId, familia.cookie);

      expect(segundo.status).toBe(200);
      expect(segundo.body).toEqual(primero.body);
    });

    it('un pago ajeno responde 404, igual que uno que no existe', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      const otra = await nuevaFamilia(app);

      const ajeno = await pedirEnlace(pagoId, otra.cookie);
      const inexistente = await pedirEnlace(nuevoId(), otra.cookie);

      expect(ajeno.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(ajeno.body).toMatchObject({ codigo: 'pago.no_encontrado' });
      expect(inexistente.body).toMatchObject({ codigo: 'pago.no_encontrado' });
      expect((ajeno.body as { detail?: string }).detail).toBe(
        (inexistente.body as { detail?: string }).detail,
      );
    });

    it('exige sesión de familia', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);

      const sinSesion = await como(app).post(`/api/v1/pagos/${pagoId}/enlace`);
      const comoCuidador = await pedirEnlace(pagoId, await c.cookie());
      const malId = await pedirEnlace('no-es-un-uuid', familia.cookie);

      expect(sinSesion.status).toBe(401);
      expect(comoCuidador.status).toBe(403);
      expect(malId.status).toBe(400);
    });

    it('un pago que ya no está pendiente responde 409', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      await aprobarPago(pagoId);

      const respuesta = await pedirEnlace(pagoId, familia.cookie);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({ codigo: 'pago.no_pendiente' });
    });

    it('pasado el plazo para pagar responde 409', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);
      // La sesión de la familia dura 15 minutos: se le emite una vigente a la hora de ahora.
      const cookie = await cookieDeFamiliaAhora(familia);

      const respuesta = await pedirEnlace(pagoId, cookie);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({ codigo: 'pago.vencido' });
    });
  });

  // ─── Avisos de la pasarela (webhook) ───────────────────────────────────────────────────────
  describe('POST /pagos/webhook/:proveedor', () => {
    it('un aviso de pago aprobado y firmado aprueba el pago y deja pagar el servicio', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      const cuerpo = aviso(pagoId);

      const respuesta = await enviarAviso(cuerpo);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ resultado: 'procesado' });
      expect(await pagoPorId(pagoId)).toMatchObject({
        estado: 'aprobado',
        aprobado_en: new Date(INICIO),
        proveedor: 'simulada',
        referencia_proveedor: `sim_${pagoId}`,
      });
      await procesarEventos();
      expect((await servicioDe(id)).pagado_en).toEqual(new Date(INICIO));
      expect(
        await eventos('pagoId', pagoId, 'pagos.pago_aprobado'),
      ).toHaveLength(1);
      expect(
        await uno(
          `select firma_valida, procesado_en, tipo from pagos.eventos_de_pasarela
           where proveedor = 'simulada' and id_evento_externo = $1`,
          [cuerpo.idEvento],
        ),
      ).toMatchObject({ firma_valida: true, tipo: 'aprobado' });
    });

    it('el mismo aviso otra vez se confirma sin repetir nada', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      const cuerpo = aviso(pagoId);

      const primero = await enviarAviso(cuerpo);
      const segundo = await enviarAviso(cuerpo);

      expect(primero.body).toEqual({ resultado: 'procesado' });
      expect(segundo.status).toBe(200);
      expect(segundo.body).toEqual({ resultado: 'duplicado' });
      expect(
        await filas(
          'select id from pagos.eventos_de_pasarela where id_evento_externo = $1',
          [cuerpo.idEvento],
        ),
      ).toHaveLength(1);
      expect(
        await eventos('pagoId', pagoId, 'pagos.pago_aprobado'),
      ).toHaveLength(1);
    });

    it('dos copias del mismo aviso a la vez: una se procesa y la otra se reconoce como repetida', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      const cuerpo = aviso(pagoId);

      const respuestas = await Promise.all([
        enviarAviso(cuerpo),
        enviarAviso(cuerpo),
        enviarAviso(cuerpo),
      ]);

      expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(
        respuestas
          .map((r) => (r.body as { resultado: string }).resultado)
          .sort(),
      ).toEqual(['duplicado', 'duplicado', 'procesado']);
      expect(
        await eventos('pagoId', pagoId, 'pagos.pago_aprobado'),
      ).toHaveLength(1);
    });

    it('otro aviso de un pago ya aprobado no lo aprueba otra vez', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      await aprobarPago(pagoId);

      const respuesta = await enviarAviso(aviso(pagoId));

      expect(respuesta.status).toBe(200);
      expect(
        await eventos('pagoId', pagoId, 'pagos.pago_aprobado'),
      ).toHaveLength(1);
      expect((await pagoPorId(pagoId)).estado).toBe('aprobado');
    });

    it.each([
      ['con una firma que no es', 'firma-falsa'],
      ['sin firma', null],
    ])('%s responde 401 y no cambia nada', async (_caso, firma) => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      const cuerpo = aviso(pagoId);

      const respuesta = await enviarAviso(cuerpo, { firma });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toMatchObject({ codigo: 'pagos.firma_invalida' });
      expect((await pagoPorId(pagoId)).estado).toBe('pendiente');
      expect(
        await filas(
          'select id from pagos.eventos_de_pasarela where id_evento_externo = $1',
          [cuerpo.idEvento],
        ),
      ).toEqual([]);
    });

    it('un cuerpo alterado después de firmarse responde 401', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      const original = aviso(pagoId, { tipo: 'pago.rechazado' });
      const firma = firmarAvisoSimulado(
        SECRETO_DE_PASARELA_DE_PRUEBA,
        Buffer.from(JSON.stringify(original)),
      );

      const respuesta = await enviarAviso(
        { ...original, tipo: 'pago.aprobado' },
        { firma },
      );

      expect(respuesta.status).toBe(401);
      expect((await pagoPorId(pagoId)).estado).toBe('pendiente');
    });

    it('una firma válida con un espacio de más en el cuerpo ya no es la misma firma', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      const texto = JSON.stringify(aviso(pagoId));
      const firma = firmarAvisoSimulado(
        SECRETO_DE_PASARELA_DE_PRUEBA,
        Buffer.from(texto),
      );

      const respuesta = await enviarAviso(`${texto} `, { firma });

      expect(respuesta.status).toBe(401);
    });

    it('un proveedor que no conocemos responde 404', async () => {
      const respuesta = await enviarAviso(aviso(nuevoId()), {
        proveedor: 'otra-pasarela',
      });

      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toMatchObject({
        codigo: 'pagos.proveedor_desconocido',
      });
    });

    it('un aviso firmado pero sin la forma esperada responde 400', async () => {
      const respuesta = await enviarAviso({ hola: 'mundo' });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toMatchObject({ codigo: 'pagos.aviso_invalido' });
    });

    it('un monto distinto al del pago no lo aprueba y queda en la auditoría', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      const cuerpo = aviso(pagoId, { monto: TOTAL - 100 });

      const respuesta = await enviarAviso(cuerpo);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ resultado: 'monto_distinto' });
      expect((await pagoPorId(pagoId)).estado).toBe('pendiente');
      expect(
        await uno<{ procesado_en: Date | null }>(
          'select procesado_en from pagos.eventos_de_pasarela where id_evento_externo = $1',
          [cuerpo.idEvento],
        ),
      ).toEqual({ procesado_en: null });
      expect(
        await filas(
          `select resultado from compartido.auditoria
           where accion = 'pagos.aviso_con_monto_distinto' and recurso_id = $1`,
          [pagoId],
        ),
      ).toEqual([{ resultado: 'error' }]);
    });

    it.each([
      ['de un pago que no existe', () => nuevoId()],
      ['con una referencia que no es de un pago', () => 'no-es-un-uuid'],
    ])('un aviso %s se confirma y se ignora', async (_caso, referencia) => {
      const respuesta = await enviarAviso(aviso(referencia()));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ resultado: 'ignorado' });
    });

    it('un aviso de otro tipo se confirma y se ignora', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);

      const respuesta = await enviarAviso(aviso(pagoId, { tipo: 'pago.otro' }));

      expect(respuesta.body).toEqual({ resultado: 'ignorado' });
      expect((await pagoPorId(pagoId)).estado).toBe('pendiente');
    });

    it('un aviso de pago rechazado cancela el servicio por pago fallido y se lo cuenta a la familia', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);

      const respuesta = await enviarAviso(
        aviso(pagoId, { tipo: 'pago.rechazado' }),
      );
      await procesarEventos();

      expect(respuesta.body).toEqual({ resultado: 'procesado' });
      expect((await pagoPorId(pagoId)).estado).toBe('rechazado');
      expect(await servicioDe(id)).toMatchObject({
        estado: 'cancelado',
        motivo_cancelacion: 'pago_fallido',
      });
      expect(
        await uno(
          `select accion, actor_id from reservas.historial_de_estados
           where servicio_id = $1 and hacia = 'cancelado'`,
          [id],
        ),
      ).toEqual({ accion: 'cancelar_por_pago', actor_id: null });
      const avisos = await avisosDe(id, 'servicio_cancelado:familia');
      expect(avisos).toHaveLength(1);
      expect(avisos[0]?.parametros).toMatchObject({ motivo: 'pago_fallido' });
      // El aviso del pago no se repite: lo explica el de la cancelación.
      expect(await avisosDe(id, 'compra_de_bolsa_fallida:familia')).toEqual([]);
    });

    it('un pago aprobado después de haber vencido no se acepta: se devuelve el dinero', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      await pedirEnlace(pagoId, familia.cookie);
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);
      await expirarSolo([pagoId]).ejecutar();
      await procesarEventos();
      expect((await pagoPorId(pagoId)).estado).toBe('expirado');
      const reembolsar = vi.spyOn(pasarela(), 'reembolsar');

      const respuesta = await enviarAviso(aviso(pagoId));

      expect(respuesta.body).toEqual({ resultado: 'tardio' });
      expect((await pagoPorId(pagoId)).estado).toBe('expirado');
      expect(reembolsar).toHaveBeenCalledWith({
        referenciaProveedor: `sim_${pagoId}`,
        monto: TOTAL,
        claveDeIdempotencia: `reembolso:${pagoId}`,
      });
      expect((await servicioDe(id)).estado).toBe('cancelado');
      expect(
        await filas(
          `select resultado from compartido.auditoria
           where accion = 'pagos.aprobacion_tardia' and recurso_id = $1`,
          [pagoId],
        ),
      ).toEqual([{ resultado: 'error' }]);
    });

    it('si la devolución de un pago tardío falla, queda en la auditoría para hacerla a mano', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      await pedirEnlace(pagoId, familia.cookie);
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);
      await expirarSolo([pagoId]).ejecutar();
      vi.spyOn(pasarela(), 'reembolsar').mockRejectedValueOnce(
        new Error('sin conexión'),
      );

      const respuesta = await enviarAviso(aviso(pagoId));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ resultado: 'tardio' });
      expect(
        await filas(
          `select resultado from compartido.auditoria
           where accion = 'pagos.reembolso_tardio_fallido' and recurso_id = $1`,
          [pagoId],
        ),
      ).toEqual([{ resultado: 'error' }]);
    });
  });

  // ─── El servicio no inicia sin pago ────────────────────────────────────────────────────────
  describe('iniciar exige el pago aprobado', () => {
    it('sin pago responde 422; con el pago aprobado, inicia', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c, {
        fecha: HOY,
        jornada: 'manana',
      });

      const sinPago = await accion('iniciar', id, await c.cookie());
      await aprobarPago(pagoId);
      const conPago = await accion('iniciar', id, await c.cookie());

      expect(sinPago.status).toBe(422);
      expect(sinPago.body).toMatchObject({ codigo: 'servicio.pago_pendiente' });
      expect(conPago.status).toBe(200);
      expect(conPago.body).toMatchObject({ servicio: { estado: 'en_curso' } });
    });
  });

  // ─── Pagos sin pagar: vencimiento y recuperación ───────────────────────────────────────────
  describe('pagos que la familia no paga', () => {
    it('antes del plazo no toca el pago; después lo vence y cancela el servicio', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);

      reloj.avanzar((MINUTOS_PARA_PAGAR - 1) * 60_000);
      const temprano = await expirarSolo([pagoId]).ejecutar();
      reloj.avanzar(2 * 60_000);
      const tarde = await expirarSolo([pagoId]).ejecutar();
      await procesarEventos();

      expect(temprano).toEqual({ vencidos: 0, recuperados: 0, fallidos: 0 });
      expect(tarde).toEqual({ vencidos: 1, recuperados: 0, fallidos: 0 });
      expect((await pagoPorId(pagoId)).estado).toBe('expirado');
      expect(
        (await eventos('pagoId', pagoId, 'pagos.pago_rechazado'))[0]?.datos,
      ).toMatchObject({ motivo: 'expirado', servicioId: id });
      expect(await servicioDe(id)).toMatchObject({
        estado: 'cancelado',
        motivo_cancelacion: 'pago_fallido',
      });
    });

    it('si la pasarela dice que sí se pagó (un aviso perdido), el pago se aprueba en vez de vencerse', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      await pedirEnlace(pagoId, familia.cookie);
      pasarela().simularEstado(`sim_${pagoId}`, 'aprobado');
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);

      const resultado = await expirarSolo([pagoId]).ejecutar();
      await procesarEventos();

      expect(resultado).toEqual({ vencidos: 0, recuperados: 1, fallidos: 0 });
      expect((await pagoPorId(pagoId)).estado).toBe('aprobado');
      expect((await servicioDe(id)).estado).toBe('aceptado');
      expect((await servicioDe(id)).pagado_en).not.toBeNull();
    });

    it('si la pasarela dice que lo rechazó, el pago se rechaza', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      await pedirEnlace(pagoId, familia.cookie);
      pasarela().simularEstado(`sim_${pagoId}`, 'rechazado');
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);

      const resultado = await expirarSolo([pagoId]).ejecutar();
      await procesarEventos();

      expect(resultado.recuperados).toBe(1);
      expect((await pagoPorId(pagoId)).estado).toBe('rechazado');
      expect((await servicioDe(id)).estado).toBe('cancelado');
    });

    it('si la pasarela dice que sigue pendiente, el pago vence', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      await pedirEnlace(pagoId, familia.cookie);
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);

      const resultado = await expirarSolo([pagoId]).ejecutar();

      expect(resultado).toEqual({ vencidos: 1, recuperados: 0, fallidos: 0 });
      expect((await pagoPorId(pagoId)).estado).toBe('expirado');
    });

    it('si la pasarela no responde, el pago no se vence a ciegas', async () => {
      const c = await cuidadorAutomatico();
      const { pagoId } = await confirmado(c);
      await pedirEnlace(pagoId, familia.cookie);
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);
      vi.spyOn(pasarela(), 'consultarEstado').mockRejectedValueOnce(
        new Error('tiempo agotado'),
      );

      const resultado = await expirarSolo([pagoId]).ejecutar();

      expect(resultado).toEqual({ vencidos: 0, recuperados: 0, fallidos: 1 });
      expect((await pagoPorId(pagoId)).estado).toBe('pendiente');
    });
  });

  // ─── Cancelación y reembolso ───────────────────────────────────────────────────────────────
  describe('cancelar el servicio devuelve el dinero', () => {
    it('sin haber pagado, el pago pendiente se cierra y no hay nada que devolver', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      const reembolsar = vi.spyOn(pasarela(), 'reembolsar');

      expect((await accion('cancelar', id, familia.cookie)).status).toBe(200);
      await procesarEventos();

      expect((await pagoPorId(pagoId)).estado).toBe('expirado');
      expect(reembolsar).not.toHaveBeenCalled();
      expect(await eventos('pagoId', pagoId, 'pagos.pago_reembolsado')).toEqual(
        [],
      );
    });

    it('con el pago aprobado, se le pide el reembolso a la pasarela y se avisa a la familia', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      await aprobarPago(pagoId);
      const reembolsar = vi.spyOn(pasarela(), 'reembolsar');

      expect((await accion('cancelar', id, familia.cookie)).status).toBe(200);
      await procesarEventos();

      expect((await pagoPorId(pagoId)).estado).toBe('reembolsado');
      expect(reembolsar).toHaveBeenCalledTimes(1);
      expect(reembolsar).toHaveBeenCalledWith({
        referenciaProveedor: `sim_${pagoId}`,
        monto: TOTAL,
        claveDeIdempotencia: `reembolso:${pagoId}`,
      });
      expect(
        await eventos('pagoId', pagoId, 'pagos.pago_reembolsado'),
      ).toHaveLength(1);
      expect(await avisosDe(id, 'pago_reembolsado:familia')).toHaveLength(1);
    });

    it('reprocesar la cancelación no devuelve el dinero dos veces', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      await aprobarPago(pagoId);
      await accion('cancelar', id, familia.cookie);
      await procesarEventos();
      const reembolsar = vi.spyOn(pasarela(), 'reembolsar');

      await repetirEvento(
        'reservas.servicio_cancelado',
        'pagos.reembolsar_servicio_cancelado',
        id,
      );

      expect(reembolsar).not.toHaveBeenCalled();
      expect((await pagoPorId(pagoId)).estado).toBe('reembolsado');
    });

    it('si la pasarela no puede devolver, el pago sigue aprobado y el evento se reintenta', async () => {
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c);
      await aprobarPago(pagoId);
      vi.spyOn(pasarela(), 'reembolsar').mockRejectedValue(
        new Error('sin conexión'),
      );

      await accion('cancelar', id, familia.cookie);
      await procesarEventos();

      expect((await pagoPorId(pagoId)).estado).toBe('aprobado');
      const evento = await uno<{ intentos: number; procesado_en: Date | null }>(
        `select intentos, procesado_en from compartido.outbox
         where tipo = 'reservas.servicio_cancelado' and datos->>'servicioId' = $1`,
        [id],
      );
      expect(evento.procesado_en).toBeNull();
      expect(evento.intentos).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Liquidación al cuidador ───────────────────────────────────────────────────────────────
  describe('liquidación al cuidador', () => {
    async function terminado(
      c: Cuidador,
    ): Promise<{ id: string; pagoId: string }> {
      const servicio = await confirmado(c, { fecha: HOY, jornada: 'manana' });
      await aprobarPago(servicio.pagoId);
      expect(
        (await accion('iniciar', servicio.id, await c.cookie())).status,
      ).toBe(200);
      expect(
        (await accion('finalizar', servicio.id, await c.cookie())).status,
      ).toBe(200);
      await procesarEventos();
      return servicio;
    }

    it('al terminar el servicio queda anotado lo que se le debe, con el pago congelado al contratar', async () => {
      const c = await cuidadorAutomatico();

      const { id } = await terminado(c);

      expect(await liquidacionDe(id)).toMatchObject({
        cuidador_id: c.cuidadorId,
        monto: AL_CUIDADOR,
        estado: 'pendiente',
        referencia_dispersion: null,
        pagada_en: null,
      });
      expect(
        await eventos('servicioId', id, 'pagos.liquidacion_realizada'),
      ).toHaveLength(1);
    });

    it('reprocesar el evento no crea otra liquidación', async () => {
      const c = await cuidadorAutomatico();
      const { id } = await terminado(c);

      await repetirEvento(
        'reservas.servicio_finalizado',
        'pagos.liquidar_servicio_finalizado',
        id,
      );

      expect(
        await filas(
          'select id from pagos.liquidaciones where servicio_id = $1',
          [id],
        ),
      ).toHaveLength(1);
      expect(
        await eventos('servicioId', id, 'pagos.liquidacion_realizada'),
      ).toHaveLength(1);
    });

    it('el cuidador ve solo sus liquidaciones y nada más que lo suyo', async () => {
      const c = await cuidadorAutomatico();
      const otro = await cuidadorAutomatico();
      const { id } = await terminado(c);

      const mias = await como(app)
        .get('/api/v1/liquidaciones')
        .set('Cookie', await c.cookie());
      const delOtro = await como(app)
        .get('/api/v1/liquidaciones')
        .set('Cookie', await otro.cookie());

      expect(mias.status).toBe(200);
      const lista = (mias.body as { liquidaciones: Record<string, unknown>[] })
        .liquidaciones;
      expect(lista).toHaveLength(1);
      expect(lista[0]).toEqual({
        id: (await liquidacionDe(id)).id,
        servicioId: id,
        monto: AL_CUIDADOR,
        estado: 'pendiente',
        pagadaEn: null,
        creadaEn: INICIO,
      });
      expect(delOtro.body).toEqual({ liquidaciones: [] });
    });

    it('exige sesión de cuidador', async () => {
      const sinSesion = await como(app).get('/api/v1/liquidaciones');
      const comoFamilia = await como(app)
        .get('/api/v1/liquidaciones')
        .set('Cookie', familia.cookie);

      expect(sinSesion.status).toBe(401);
      expect(comoFamilia.status).toBe(403);
    });

    it('el dispersor le paga al cuidador y la liquidación queda pagada', async () => {
      const c = await cuidadorAutomatico();
      const { id } = await terminado(c);
      const liquidacion = await liquidacionDe(id);

      const resultado = await dispersarSolo([liquidacion.id]).ejecutar();

      expect(resultado).toEqual({
        pagadas: 1,
        enviadas: 0,
        rechazadas: 0,
        interrumpida: false,
      });
      expect(await liquidacionDe(id)).toMatchObject({
        estado: 'pagada',
        referencia_dispersion: `sim_pago_${liquidacion.id}`,
        pagada_en: new Date(INICIO),
      });
      expect(dispersor().ordenesRecibidas().get(liquidacion.id)).toEqual({
        liquidacionId: liquidacion.id,
        cuidadorId: c.cuidadorId,
        monto: AL_CUIDADOR,
      });
      const lista = await como(app)
        .get('/api/v1/liquidaciones')
        .set('Cookie', await c.cookie());
      expect(
        (lista.body as { liquidaciones: { estado: string }[] }).liquidaciones[0]
          ?.estado,
      ).toBe('pagada');
    });

    it('una liquidación pagada no se vuelve a pagar', async () => {
      const c = await cuidadorAutomatico();
      const { id } = await terminado(c);
      const { id: liquidacionId } = await liquidacionDe(id);
      await dispersarSolo([liquidacionId]).ejecutar();
      const dispersar = vi.spyOn(dispersor(), 'dispersar');

      const resultado = await dispersarSolo([liquidacionId]).ejecutar();

      expect(resultado.pagadas).toBe(0);
      expect(dispersar).not.toHaveBeenCalled();
    });

    it('un rechazo definitivo deja la liquidación fallida, a la vista', async () => {
      const c = await cuidadorAutomatico();
      const { id } = await terminado(c);
      const { id: liquidacionId } = await liquidacionDe(id);
      dispersor().rechazarLiquidacion(liquidacionId);

      const resultado = await dispersarSolo([liquidacionId]).ejecutar();

      expect(resultado).toMatchObject({ rechazadas: 1, pagadas: 0 });
      expect((await liquidacionDe(id)).estado).toBe('fallida');
    });

    it('un error pasajero del proveedor detiene la ronda y la liquidación sigue pendiente', async () => {
      const c = await cuidadorAutomatico();
      const { id } = await terminado(c);
      const { id: liquidacionId } = await liquidacionDe(id);
      dispersor().fallarPasajeramente(true);

      const fallida = await dispersarSolo([liquidacionId]).ejecutar();
      dispersor().fallarPasajeramente(false);
      const reintento = await dispersarSolo([liquidacionId]).ejecutar();

      expect(fallida).toMatchObject({ interrumpida: true, pagadas: 0 });
      expect(reintento).toMatchObject({ interrumpida: false, pagadas: 1 });
      expect((await liquidacionDe(id)).estado).toBe('pagada');
    });
  });

  // ─── Catálogo y compra de la bolsa ─────────────────────────────────────────────────────────
  describe('paquetes de la bolsa', () => {
    it('el catálogo es público, sin los inactivos, del más barato al más caro y con el descuento en porcentaje', async () => {
      const caro = await nuevoPaquete({
        precio: 450_000,
        credito: 500_000,
        descuentoBps: 1000,
      });
      const barato = await nuevoPaquete({
        precio: 95_000,
        credito: 100_000,
        descuentoBps: 500,
      });
      const apagado = await nuevoPaquete({ activo: false });

      const respuesta = await como(app).get('/api/v1/catalogo/bolsas');

      expect(respuesta.status).toBe(200);
      const paquetes = (
        respuesta.body as { paquetes: { codigo: string }[] }
      ).paquetes.filter((p) => p.codigo.startsWith('prueba-api-'));
      const codigos = paquetes.map((p) => p.codigo);
      expect(codigos).not.toContain(apagado);
      expect(codigos.indexOf(barato)).toBeLessThan(codigos.indexOf(caro));
      expect(paquetes.find((p) => p.codigo === barato)).toEqual({
        codigo: barato,
        horasReferencia: 5,
        descuento: 5,
        credito: 100_000,
        precio: 95_000,
      });
    });
  });

  describe('POST /bolsa/compras', () => {
    it('crea un pago pendiente por el PRECIO del paquete y devuelve el enlace de pago', async () => {
      const f = await nuevaFamilia(app);
      const paquete = await nuevoPaquete({ precio: 90_000, credito: 100_000 });

      const respuesta = await comprar(f.cookie, paquete);

      expect(respuesta.status).toBe(201);
      const cuerpo = respuesta.body as {
        pago: Record<string, unknown>;
        urlDePago: string;
      };
      expect(cuerpo.pago).toMatchObject({
        concepto: 'bolsa',
        paqueteCodigo: paquete,
        medio: 'pasarela',
        montoTotal: 90_000,
        estado: 'pendiente',
        servicioId: null,
        venceEn: '2030-06-10T15:30:00.000Z',
      });
      expect(cuerpo.urlDePago).toContain(String(cuerpo.pago.id));
      expect(await pagoPorId(String(cuerpo.pago.id))).toMatchObject({
        pagador_id: f.persona.id,
        proveedor: 'simulada',
      });
    });

    it('reenviar la compra con la misma clave devuelve el mismo pago', async () => {
      const f = await nuevaFamilia(app);
      const paquete = await nuevoPaquete();
      const llave = clave();

      const primera = await comprar(f.cookie, paquete, llave);
      const segunda = await comprar(f.cookie, paquete, llave);

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(200);
      expect((segunda.body as { pago: { id: string } }).pago.id).toBe(
        (primera.body as { pago: { id: string } }).pago.id,
      );
      expect(
        await filas('select id from pagos.pagos where pagador_id = $1', [
          f.persona.id,
        ]),
      ).toHaveLength(1);
    });

    it('dos envíos a la vez con la misma clave crean un solo pago', async () => {
      const f = await nuevaFamilia(app);
      const paquete = await nuevoPaquete();
      const llave = clave();

      const respuestas = await Promise.all([
        comprar(f.cookie, paquete, llave),
        comprar(f.cookie, paquete, llave),
        comprar(f.cookie, paquete, llave),
      ]);

      expect(respuestas.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        200, 200, 201,
      ]);
      expect(
        new Set(
          respuestas.map((r) => (r.body as { pago: { id: string } }).pago.id),
        ).size,
      ).toBe(1);
      expect(
        await filas('select id from pagos.pagos where pagador_id = $1', [
          f.persona.id,
        ]),
      ).toHaveLength(1);
    });

    it('la misma clave con otro paquete es un error, no una compra nueva', async () => {
      const f = await nuevaFamilia(app);
      const llave = clave();
      await comprar(f.cookie, await nuevoPaquete(), llave);

      const respuesta = await comprar(f.cookie, await nuevoPaquete(), llave);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({
        codigo: 'idempotencia.clave_reutilizada',
      });
    });

    it('un reintento de una compra ya pagada devuelve el pago sin enlace', async () => {
      const f = await nuevaFamilia(app);
      const paquete = await nuevoPaquete();
      const llave = clave();
      const primera = await comprar(f.cookie, paquete, llave);
      const pagoId = (primera.body as { pago: { id: string } }).pago.id;
      await aprobarPago(pagoId, 90_000);

      const segunda = await comprar(f.cookie, paquete, llave);

      expect(segunda.status).toBe(200);
      expect(segunda.body).toMatchObject({
        pago: { estado: 'aprobado' },
        urlDePago: null,
      });
    });

    it('exige Idempotency-Key, un paquete a la venta y solo el campo del paquete', async () => {
      const f = await nuevaFamilia(app);
      const paquete = await nuevoPaquete();
      const apagado = await nuevoPaquete({ activo: false });

      const sinClave = await comprar(f.cookie, paquete, null);
      const inexistente = await comprar(f.cookie, 'no-existe');
      const inactivo = await comprar(f.cookie, apagado);
      const conPrecio = await como(app)
        .post('/api/v1/bolsa/compras')
        .set('Cookie', f.cookie)
        .set('Idempotency-Key', clave())
        .send({ paquete, precio: 1 });
      const malFormado = await comprar(f.cookie, 'con espacios!');

      expect(sinClave.status).toBe(400);
      expect(sinClave.body).toMatchObject({ codigo: 'idempotencia.falta' });
      expect(inexistente.status).toBe(404);
      expect(inexistente.body).toMatchObject({
        codigo: 'paquete.no_encontrado',
      });
      expect(inactivo.status).toBe(404);
      expect(conPrecio.status).toBe(400);
      expect(malFormado.status).toBe(400);
    });

    it('solo la familia compra', async () => {
      const c = await cuidadorAutomatico();
      const paquete = await nuevoPaquete();

      const sinSesion = await como(app)
        .post('/api/v1/bolsa/compras')
        .set('Idempotency-Key', clave())
        .send({ paquete });
      const comoCuidador = await comprar(await c.cookie(), paquete);

      expect(sinSesion.status).toBe(401);
      expect(comoCuidador.status).toBe(403);
    });

    it('el aviso de pago aprobado acredita el CRÉDITO del paquete, una sola vez', async () => {
      const f = await nuevaFamilia(app);
      const paquete = await nuevoPaquete({ precio: 90_000, credito: 100_000 });
      const compra = await comprar(f.cookie, paquete);
      const pagoId = (compra.body as { pago: { id: string } }).pago.id;

      await aprobarPago(pagoId, 90_000);
      await aprobarPago(pagoId, 90_000);

      expect(await saldosDe(f)).toEqual({ disponible: 100_000, reservado: 0 });
      expect(await movimientosDe(f)).toEqual([
        { tipo: 'compra', delta_disponible: 100_000, delta_reservado: 0 },
      ]);
      expect(
        await uno<{ pago_id: string }>(
          `select m.pago_id from pagos.movimientos_de_bolsa m
           join pagos.bolsas b on b.id = m.bolsa_id where b.familiar_id = $1`,
          [f.persona.id],
        ),
      ).toEqual({ pago_id: pagoId });
      expect(
        await eventos('pagoId', pagoId, 'pagos.bolsa_comprada'),
      ).toHaveLength(1);
      const bolsa = await como(app)
        .get('/api/v1/bolsa')
        .set('Cookie', f.cookie);
      expect(bolsa.body).toMatchObject({
        bolsa: {
          saldoDisponible: 100_000,
          saldoReservado: 0,
          movimientos: [{ tipo: 'compra', deltaDisponible: 100_000 }],
        },
      });
      expect(
        await filas(
          `select id from notificaciones.notificaciones
           where destinatario_id = $1 and tipo = 'bolsa_comprada:familia'`,
          [f.persona.id],
        ),
      ).toHaveLength(1);
    });

    it('si el pago de la compra se rechaza, la bolsa no recibe nada y se avisa a la familia', async () => {
      const f = await nuevaFamilia(app);
      const compra = await comprar(f.cookie, await nuevoPaquete());
      const pagoId = (compra.body as { pago: { id: string } }).pago.id;

      await enviarAviso(
        aviso(pagoId, { tipo: 'pago.rechazado', monto: 90_000 }),
      );
      await procesarEventos();

      expect((await pagoPorId(pagoId)).estado).toBe('rechazado');
      expect(
        await filas('select id from pagos.bolsas where familiar_id = $1', [
          f.persona.id,
        ]),
      ).toEqual([]);
      expect(
        await filas(
          `select parametros from notificaciones.notificaciones
           where destinatario_id = $1 and tipo = 'compra_de_bolsa_fallida:familia'`,
          [f.persona.id],
        ),
      ).toEqual([{ parametros: { motivo: 'rechazado' } }]);
    });

    it('una compra que venció y se pagó tarde no acredita la bolsa: se devuelve', async () => {
      const f = await nuevaFamilia(app);
      const compra = await comprar(
        f.cookie,
        await nuevoPaquete({ precio: 90_000 }),
      );
      const pagoId = (compra.body as { pago: { id: string } }).pago.id;
      reloj.avanzar((MINUTOS_PARA_PAGAR + 1) * 60_000);
      await expirarSolo([pagoId]).ejecutar();
      const reembolsar = vi.spyOn(pasarela(), 'reembolsar');

      const respuesta = await enviarAviso(aviso(pagoId, { monto: 90_000 }));

      expect(respuesta.body).toEqual({ resultado: 'tardio' });
      expect(
        await filas('select id from pagos.bolsas where familiar_id = $1', [
          f.persona.id,
        ]),
      ).toEqual([]);
      expect(reembolsar).toHaveBeenCalledWith(
        expect.objectContaining({ monto: 90_000 }),
      );
    });

    it('una familia que nunca compró tiene la bolsa en cero y la consulta no la crea', async () => {
      const f = await nuevaFamilia(app);

      const respuesta = await como(app)
        .get('/api/v1/bolsa')
        .set('Cookie', f.cookie);

      expect(respuesta.body).toEqual({
        bolsa: { saldoDisponible: 0, saldoReservado: 0, movimientos: [] },
      });
      expect(
        await filas('select id from pagos.bolsas where familiar_id = $1', [
          f.persona.id,
        ]),
      ).toEqual([]);
    });
  });

  // ─── Pagar un servicio con la bolsa ────────────────────────────────────────────────────────
  describe('servicios pagados con la bolsa', () => {
    it('sin saldo suficiente no se puede ni pedir el servicio', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      await darSaldo(f, TOTAL - 1);

      const respuesta = await solicitar(c, { medioDePago: 'bolsa' }, f);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({
        codigo: 'bolsa.saldo_insuficiente',
      });
      expect(
        await filas(
          'select id from reservas.servicios where familiar_id = $1',
          [f.persona.id],
        ),
      ).toEqual([]);
    });

    it('al confirmarse aparta el saldo y el pago queda aprobado de una vez', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      await darSaldo(f, 100_000);

      const { id, pagoId } = await confirmado(c, { medioDePago: 'bolsa' }, f);

      expect(await pagoPorId(pagoId)).toMatchObject({
        estado: 'aprobado',
        medio: 'bolsa',
        monto_total: TOTAL,
        aprobado_en: new Date(INICIO),
      });
      expect(await saldosDe(f)).toEqual({
        disponible: 100_000 - TOTAL,
        reservado: TOTAL,
      });
      expect(await movimientosDe(f)).toEqual([
        { tipo: 'reserva', delta_disponible: -TOTAL, delta_reservado: TOTAL },
      ]);
      expect((await servicioDe(id)).pagado_en).toEqual(new Date(INICIO));
      // Con la bolsa no hay nada que pagar después: no se avisa de ningún pago pendiente.
      expect(await avisosDe(id, 'pago_requerido:familia')).toEqual([]);
    });

    it('un pago de la bolsa no tiene enlace de pago', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      await darSaldo(f, 100_000);
      const { pagoId } = await confirmado(c, { medioDePago: 'bolsa' }, f);

      const respuesta = await pedirEnlace(pagoId, f.cookie);

      expect(respuesta.status).toBe(409);
    });

    it('al terminar el servicio el saldo apartado se consume y se liquida al cuidador', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      await darSaldo(f, 100_000);
      const { id } = await confirmado(
        c,
        { medioDePago: 'bolsa', fecha: HOY, jornada: 'manana' },
        f,
      );

      expect((await accion('iniciar', id, await c.cookie())).status).toBe(200);
      expect((await accion('finalizar', id, await c.cookie())).status).toBe(
        200,
      );
      await procesarEventos();

      expect(await saldosDe(f)).toEqual({
        disponible: 100_000 - TOTAL,
        reservado: 0,
      });
      expect((await movimientosDe(f)).map((m) => m.tipo)).toEqual([
        'reserva',
        'consumo',
      ]);
      expect(await liquidacionDe(id)).toMatchObject({ monto: AL_CUIDADOR });
    });

    it('cancelar el servicio libera el saldo apartado', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      await darSaldo(f, 100_000);
      const { id, pagoId } = await confirmado(c, { medioDePago: 'bolsa' }, f);

      expect((await accion('cancelar', id, f.cookie)).status).toBe(200);
      await procesarEventos();

      expect(await saldosDe(f)).toEqual({ disponible: 100_000, reservado: 0 });
      expect((await movimientosDe(f)).map((m) => m.tipo)).toEqual([
        'reserva',
        'liberacion',
      ]);
      expect((await pagoPorId(pagoId)).estado).toBe('reembolsado');
      expect(await avisosDe(id, 'pago_reembolsado:familia')).toHaveLength(1);
    });

    it('reprocesar la cancelación no libera el saldo dos veces', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      await darSaldo(f, 100_000);
      const { id } = await confirmado(c, { medioDePago: 'bolsa' }, f);
      await accion('cancelar', id, f.cookie);
      await procesarEventos();

      await repetirEvento(
        'reservas.servicio_cancelado',
        'pagos.reembolsar_servicio_cancelado',
        id,
      );

      expect(await saldosDe(f)).toEqual({ disponible: 100_000, reservado: 0 });
    });

    it('si el saldo se gastó entre pedir y confirmar, el pago se rechaza y el servicio se cancela', async () => {
      const f = await nuevaFamilia(app);
      const primero = await cuidadorManual();
      const segundo = await cuidadorManual();
      // Alcanza para uno solo, pero al pedirlos todavía alcanza para cada uno.
      await darSaldo(f, TOTAL);
      const idPrimero = await crearServicio(
        primero,
        { medioDePago: 'bolsa' },
        f,
      );
      const idSegundo = await crearServicio(
        segundo,
        { medioDePago: 'bolsa' },
        f,
      );

      await accion('aceptar', idPrimero, await primero.cookie());
      await procesarEventos();
      await accion('aceptar', idSegundo, await segundo.cookie());
      await procesarEventos();

      expect((await pagoDe(idPrimero)).estado).toBe('aprobado');
      expect((await pagoDe(idSegundo)).estado).toBe('rechazado');
      expect(
        (await eventos('servicioId', idSegundo, 'pagos.pago_rechazado'))[0]
          ?.datos,
      ).toMatchObject({ motivo: 'saldo_insuficiente' });
      expect(await servicioDe(idSegundo)).toMatchObject({
        estado: 'cancelado',
        motivo_cancelacion: 'pago_fallido',
      });
      expect((await servicioDe(idPrimero)).estado).toBe('aceptado');
      // La bolsa quedó como si el segundo nunca la hubiera tocado.
      expect(await saldosDe(f)).toEqual({ disponible: 0, reservado: TOTAL });
    });
  });

  // ─── Lo que ve la familia ──────────────────────────────────────────────────────────────────
  describe('GET /pagos', () => {
    it('lista los pagos de la familia sin lo que gana el cuidador ni la plataforma', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      const { id, pagoId } = await confirmado(c, {}, f);

      const respuesta = await como(app)
        .get('/api/v1/pagos')
        .set('Cookie', f.cookie);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        pagos: [
          {
            id: pagoId,
            concepto: 'servicio',
            servicioId: id,
            paqueteCodigo: null,
            medio: 'pasarela',
            montoTotal: TOTAL,
            estado: 'pendiente',
            venceEn: '2030-06-10T15:30:00.000Z',
            creadoEn: INICIO,
          },
        ],
      });
      expect(JSON.stringify(respuesta.body)).not.toMatch(
        /pagoProfesional|ingresoPlataforma|referencia|proveedor/i,
      );
    });

    it('otra familia no ve pagos ajenos', async () => {
      const f = await nuevaFamilia(app);
      const c = await cuidadorAutomatico();
      await confirmado(c, {}, f);
      const otra = await nuevaFamilia(app);

      const respuesta = await como(app)
        .get('/api/v1/pagos')
        .set('Cookie', otra.cookie);

      expect(respuesta.body).toEqual({ pagos: [] });
    });

    it('exige sesión de familia', async () => {
      const c = await cuidadorAutomatico();

      const sinSesion = await como(app).get('/api/v1/pagos');
      const bolsaSinSesion = await como(app).get('/api/v1/bolsa');
      const comoCuidador = await como(app)
        .get('/api/v1/pagos')
        .set('Cookie', await c.cookie());

      expect(sinSesion.status).toBe(401);
      expect(bolsaSinSesion.status).toBe(401);
      expect(comoCuidador.status).toBe(403);
    });
  });
});
