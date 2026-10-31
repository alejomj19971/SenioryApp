import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import type { EventoDeIntegracion } from '../../src/compartido/eventos/evento-de-integracion.js';
import { DespachadorDeEventos } from '../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { RegistroDeManejadores } from '../../src/compartido/infraestructura/outbox/registro-de-manejadores.js';
import { CrearAvisos } from '../../src/notificaciones/aplicacion/casos-de-uso/crear-avisos.js';
import { EntregarPendientes } from '../../src/notificaciones/aplicacion/casos-de-uso/entregar-pendientes.js';
import { como, SECRETO_BFF } from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import { expirarSolicitudesDe } from '../soporte/expiracion.js';
import {
  nuevaFamilia,
  nuevoCuidador,
  type Cuidador,
  type Familia,
} from '../soporte/escenario.js';

// M5 §6 (API): los avisos de cada cambio del servicio, de punta a punta con la aplicación completa y Postgres
// real. El reloj está en el lunes 10 de junio de 2030 a las 10:00 en Bogotá.

const INICIO = '2030-06-10T15:00:00.000Z';
const HOY = '2030-06-10';
const MANANA = '2030-06-11';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

interface Aviso {
  tipo: string;
  canal: string;
  estado: string;
  prioridad: string;
  destinatario_id: string;
  parametros: Record<string, unknown>;
}

describe('notificaciones (API)', () => {
  let app: NestExpressApplication;
  let familia: Familia;

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: { SECRETO_BFF },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
    familia = await nuevaFamilia(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => reloj.fijar(INICIO));

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────

  const solicitar = (c: Cuidador, cambios: Record<string, unknown> = {}) =>
    como(app)
      .post('/api/v1/servicios')
      .set('Cookie', familia.cookie)
      .set('Idempotency-Key', clave())
      .send({
        adultoMayorId: familia.adultoMayorId,
        cuidadorId: c.cuidadorId,
        fecha: MANANA,
        jornada: 'manana',
        horas: 2,
        medioDePago: 'pasarela',
        ...cambios,
      });

  async function crearServicio(c: Cuidador, cambios = {}): Promise<string> {
    const respuesta = await solicitar(c, cambios);
    expect([200, 201]).toContain(respuesta.status);
    return (respuesta.body as { servicio: { id: string } }).servicio.id;
  }

  const accion = (ruta: string, id: string, cookie: string) =>
    como(app)
      .post(`/api/v1/servicios/${id}/${ruta}`)
      .set('Cookie', cookie)
      .send({});

  const procesarEventos = () =>
    app.get(DespachadorDeEventos, { strict: false }).esperarEntregas();

  const entregar = () => entregarTodo(app);

  // Los avisos de un servicio (todos los canales), identificados por el parámetro `servicioId`.
  const avisosDe = (servicioId: string) =>
    filas<Aviso>(
      `select tipo, canal, estado, prioridad, destinatario_id, parametros
       from notificaciones.notificaciones where parametros->>'servicioId' = $1
       order by creada_en, tipo`,
      [servicioId],
    );

  const tiposDe = async (servicioId: string) =>
    (await avisosDe(servicioId))
      .map((a) => a.tipo)
      .sort((a, b) => String(a).localeCompare(String(b)));

  const miCampana = (cookie: string, consulta = '') =>
    como(app).get(`/api/v1/notificaciones${consulta}`).set('Cookie', cookie);

  async function titulosDe(cookie: string): Promise<string[]> {
    const respuesta = await miCampana(cookie);
    return (
      respuesta.body as { notificaciones: { titulo: string }[] }
    ).notificaciones.map((n) => n.titulo);
  }

  // ─── Un aviso por cada cambio, para las dos partes ─────────────────────────────────────────
  describe('cada cambio de estado del servicio avisa a las dos partes', () => {
    it('solicitar: el cuidador recibe la solicitud y la familia la constancia', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await procesarEventos();

      const avisos = await avisosDe(id);

      expect(
        avisos
          .map((a) => [a.tipo, a.destinatario_id])
          .sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual(
        [
          ['servicio_solicitado:cuidador', c.usuarioId],
          ['servicio_solicitado:familia', familia.persona.id],
        ].sort((a, b) => String(a).localeCompare(String(b))),
      );
      expect(
        avisos.every((a) => a.estado === 'pendiente' && a.canal === 'app'),
      ).toBe(true);
      expect(avisos.every((a) => a.prioridad === 'normal')).toBe(true);
    });

    it('el aviso lleva solo fecha, franja y horas: nada de nombres ni de salud', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await procesarEventos();

      const [aviso] = await avisosDe(id);

      expect(aviso?.parametros).toEqual({
        servicioId: id,
        fecha: MANANA,
        jornada: 'manana',
        horas: 2,
      });
    });

    it('el recorrido completo deja 9 avisos: solicitado, confirmado, iniciado y finalizado × 2 partes, y el de pago', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c, { fecha: HOY, jornada: 'manana' });
      await accion('aceptar', id, await c.cookie());
      await accion('iniciar', id, await c.cookie());
      await accion('finalizar', id, await c.cookie());
      await procesarEventos();

      expect(await tiposDe(id)).toEqual([
        // Al confirmarse, Pagos le pide a la familia que pague (se paga con la pasarela).
        'pago_requerido:familia',
        'servicio_confirmado:cuidador',
        'servicio_confirmado:familia',
        'servicio_finalizado:cuidador',
        'servicio_finalizado:familia',
        'servicio_iniciado:cuidador',
        'servicio_iniciado:familia',
        'servicio_solicitado:cuidador',
        'servicio_solicitado:familia',
      ]);
    });

    it('con aceptación automática avisa de la solicitud y de la confirmación', async () => {
      const c = await nuevoCuidador(app, reloj, { aceptacionAutomatica: true });
      const id = await crearServicio(c);
      await procesarEventos();

      expect(await tiposDe(id)).toEqual([
        'pago_requerido:familia',
        'servicio_confirmado:cuidador',
        'servicio_confirmado:familia',
        'servicio_solicitado:cuidador',
        'servicio_solicitado:familia',
      ]);
    });

    it.each([
      ['rechazada', 'rechazar'],
      ['cancelada_por_familia', 'cancelar'],
    ])('cancelación %s: ambas partes, con el motivo', async (motivo, ruta) => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await accion(
        ruta,
        id,
        ruta === 'rechazar' ? await c.cookie() : familia.cookie,
      );
      await procesarEventos();

      const cancelados = (await avisosDe(id)).filter((a) =>
        a.tipo.startsWith('servicio_cancelado'),
      );

      expect(
        cancelados
          .map((a) => a.tipo)
          .sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual(['servicio_cancelado:cuidador', 'servicio_cancelado:familia']);
      expect(cancelados.every((a) => a.parametros.motivo === motivo)).toBe(
        true,
      );
    });

    it('cancelación por expiración: ambas partes con el motivo «expirada»', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      reloj.avanzar(2 * 60 * 60_000);
      await expirarSolicitudesDe(app, [id]).ejecutar();
      await procesarEventos();

      const cancelados = (await avisosDe(id)).filter((a) =>
        a.tipo.startsWith('servicio_cancelado'),
      );

      expect(cancelados).toHaveLength(2);
      expect(cancelados.every((a) => a.parametros.motivo === 'expirada')).toBe(
        true,
      );
    });
  });

  // ─── Reprocesar no duplica ─────────────────────────────────────────────────────────────────
  describe('reprocesar un evento no repite el aviso', () => {
    it('el mismo evento entregado otra vez al manejador no crea avisos nuevos', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await procesarEventos();
      const antes = await avisosDe(id);
      const [fila] = await filas<{
        id: string;
        tipo: string;
        version: number;
        creado_en: Date;
        id_de_correlacion: string;
        datos: unknown;
      }>(
        `select id, tipo, version, creado_en, id_de_correlacion, datos from compartido.outbox
         where tipo = 'reservas.servicio_solicitado' and datos->>'servicioId' = $1`,
        [id],
      );
      const evento: EventoDeIntegracion = {
        id: fila!.id,
        tipo: fila!.tipo,
        version: fila!.version,
        ocurridoEn: fila!.creado_en.toISOString(),
        idDeCorrelacion: fila!.id_de_correlacion,
        datos: fila!.datos,
      };

      for (const manejador of app
        .get(RegistroDeManejadores, { strict: false })
        .para('reservas.servicio_solicitado')) {
        await manejador.manejar(evento);
        await manejador.manejar(evento);
      }

      expect(await avisosDe(id)).toHaveLength(antes.length);
    });

    it('el despachador entrega cada evento una sola vez a cada manejador', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await procesarEventos();
      await app
        .get(DespachadorDeEventos, { strict: false })
        .procesarPendientes();
      await procesarEventos();

      expect(await avisosDe(id)).toHaveLength(2);
    });

    it('los manejadores de Notificaciones están registrados, uno por evento del servicio', () => {
      const registro = app.get(RegistroDeManejadores, { strict: false });
      const nombres = [
        'reservas.servicio_solicitado',
        'reservas.servicio_confirmado',
        'reservas.servicio_iniciado',
        'reservas.servicio_finalizado',
        'reservas.servicio_cancelado',
      ].map(
        (tipo) =>
          registro
            .para(tipo)
            .filter((m) => m.nombre.startsWith('notificaciones.')).length,
      );

      expect(nombres).toEqual([1, 1, 1, 1, 1]);
    });
  });

  // ─── Envío ─────────────────────────────────────────────────────────────────────────────────
  describe('envío', () => {
    it('la aplicación entrega al instante: el aviso queda «entregado» con su hora', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await procesarEventos();

      const tomadas = await entregar();

      expect(tomadas).toBeGreaterThanOrEqual(2);
      const avisos = await avisosDe(id);
      expect(avisos.every((a) => a.estado === 'entregada')).toBe(true);
      const [intento] = await filas<{ resultado: string }>(
        `select i.resultado from notificaciones.intentos_de_envio i
         join notificaciones.notificaciones n on n.id = i.notificacion_id
         where n.parametros->>'servicioId' = $1 limit 1`,
        [id],
      );
      expect(intento?.resultado).toBe('exito');
    });

    it('un aviso ya entregado no se vuelve a enviar', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await procesarEventos();
      await entregar();

      await entregar();

      const intentos = await filas(
        `select 1 from notificaciones.intentos_de_envio i
         join notificaciones.notificaciones n on n.id = i.notificacion_id
         where n.parametros->>'servicioId' = $1`,
        [id],
      );
      expect(intentos).toHaveLength(2);
    });

    it('sin canales de correo, SMS ni WhatsApp (sin proveedor) solo sale por la aplicación', async () => {
      const c = await nuevoCuidador(app, reloj);
      const id = await crearServicio(c);
      await procesarEventos();

      const canales = new Set((await avisosDe(id)).map((a) => a.canal));

      expect([...canales]).toEqual(['app']);
    });
  });

  // ─── La campana ────────────────────────────────────────────────────────────────────────────
  describe('GET /notificaciones', () => {
    it('cada quien ve los suyos, con el texto armado', async () => {
      const c = await nuevoCuidador(app, reloj);
      await crearServicio(c);
      await procesarEventos();
      await entregar();

      const delCuidador = await titulosDe(await c.cookie());
      const delaFamilia = await titulosDe(familia.cookie);

      expect(delCuidador).toEqual(['Nueva solicitud de servicio']);
      expect(delaFamilia).toContain('Solicitud enviada');
      expect(delaFamilia).not.toContain('Nueva solicitud de servicio');
    });

    it('la respuesta tiene exactamente estos campos y ninguno interno', async () => {
      const c = await nuevoCuidador(app, reloj);
      await crearServicio(c);
      await procesarEventos();
      await entregar();

      const respuesta = await miCampana(await c.cookie());

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        notificaciones: [
          {
            id: expect.any(String) as string,
            tipo: 'servicio_solicitado:cuidador',
            titulo: 'Nueva solicitud de servicio',
            cuerpo:
              'Tienes una solicitud para el martes 11 de junio, en la mañana, por 2 horas. Respóndela en Seniory antes de que venza el plazo.',
            prioridad: 'normal',
            creadaEn: INICIO,
          },
        ],
        siguiente: null,
      });
    });

    it('no revela nombres ni datos de las personas', async () => {
      const c = await nuevoCuidador(app, reloj);
      await crearServicio(c);
      await procesarEventos();
      await entregar();

      const textoFamilia = JSON.stringify(
        (await miCampana(familia.cookie)).body,
      );
      const textoCuidador = JSON.stringify(
        (await miCampana(await c.cookie())).body,
      );

      for (const texto of [textoFamilia, textoCuidador]) {
        expect(texto).not.toContain('Carmen');
        expect(texto).not.toContain(c.nombre);
        expect(texto).not.toContain('573104445566');
        expect(texto).not.toContain('servicioId');
      }
    });

    it('una persona sin avisos ve una lista vacía', async () => {
      const otra = await nuevaFamilia(app);

      const respuesta = await miCampana(otra.cookie);

      expect(respuesta.body).toEqual({ notificaciones: [], siguiente: null });
    });

    it('pagina con cursor, los más recientes primero', async () => {
      const otra = await nuevaFamilia(app);
      const c = await nuevoCuidador(app, reloj);
      const pedir = async (jornada: string) => {
        reloj.avanzar(1000);
        const respuesta = await como(app)
          .post('/api/v1/servicios')
          .set('Cookie', otra.cookie)
          .set('Idempotency-Key', clave())
          .send({
            adultoMayorId: otra.adultoMayorId,
            cuidadorId: c.cuidadorId,
            fecha: MANANA,
            jornada,
            horas: 1,
            medioDePago: 'pasarela',
          });
        return (respuesta.body as { servicio: { id: string } }).servicio.id;
      };
      for (const jornada of ['manana', 'tarde', 'noche']) await pedir(jornada);
      await procesarEventos();

      // Las sesiones duran 15 minutos y el reloj se movió segundos: siguen vigentes.
      const primera = await miCampana(otra.cookie, '?limite=2');
      const { notificaciones: pagina1, siguiente } = primera.body as {
        notificaciones: { id: string; creadaEn: string }[];
        siguiente: string;
      };
      const segunda = await miCampana(
        otra.cookie,
        `?limite=2&cursor=${siguiente}`,
      );
      const pagina2 = (segunda.body as { notificaciones: { id: string }[] })
        .notificaciones;

      expect(pagina1).toHaveLength(2);
      expect(pagina2).toHaveLength(1);
      expect(new Set([...pagina1, ...pagina2].map((n) => n.id)).size).toBe(3);
      expect(pagina1[0]!.creadaEn >= pagina1[1]!.creadaEn).toBe(true);
    });

    it('sin sesión es 401', async () => {
      expect((await como(app).get('/api/v1/notificaciones')).status).toBe(401);
    });

    it.each([
      ['un límite de cero', 'limite=0'],
      ['un límite que pasa el máximo', 'limite=51'],
      ['un cursor inventado', 'cursor=esto-no-es-un-cursor'],
      ['un parámetro que no existe', 'destinatarioId=otro'],
    ])('rechaza %s con 400', async (_nombre, consulta) => {
      expect((await miCampana(familia.cookie, `?${consulta}`)).status).toBe(
        400,
      );
    });

    it('el destinatario sale de la sesión, nunca de un parámetro: no se puede leer la campana ajena', async () => {
      const c = await nuevoCuidador(app, reloj);
      await crearServicio(c);
      await procesarEventos();
      await entregar();
      const intruso = await nuevaFamilia(app);

      const respuesta = await miCampana(
        intruso.cookie,
        `?destinatarioId=${c.usuarioId}`,
      );

      expect(respuesta.status).toBe(400);
      expect((await miCampana(intruso.cookie)).body).toEqual({
        notificaciones: [],
        siguiente: null,
      });
    });
  });

  // ─── Alertas por varios canales ────────────────────────────────────────────────────────────
  describe('alertas (prioridad alta)', () => {
    it('con un solo canal real hoy, la alerta sale por la aplicación y llega', async () => {
      const crear = app.get(CrearAvisos, { strict: false });
      const evento = nuevoId();

      const creados = await crear.ejecutar({
        eventoId: evento,
        destinatarioId: familia.persona.id,
        tipo: 'servicio_confirmado:familia',
        prioridad: 'alta',
        parametros: { fecha: MANANA, jornada: 'manana', horas: 1 },
      });
      await entregar();

      expect(creados).toBe(1);
      const [aviso] = await filas<{ estado: string; prioridad: string }>(
        'select estado, prioridad from notificaciones.notificaciones where evento_id = $1',
        [evento],
      );
      expect(aviso).toEqual({ estado: 'entregada', prioridad: 'alta' });
    });
  });
});

// Con los canales simulados encendidos (solo desarrollo y pruebas) los avisos salen también por correo, y las
// alertas por SMS, WhatsApp y push.
describe('notificaciones con canales simulados (API)', () => {
  let app: NestExpressApplication;
  let familia: Familia;
  const relojSimulado = new RelojFalso(INICIO);

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: { SECRETO_BFF, CANALES_DE_NOTIFICACION_SIMULADOS: 'true' },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(relojSimulado),
    });
    familia = await nuevaFamilia(app);
    const telefono = await como(app)
      .patch('/api/v1/yo')
      .set('Cookie', familia.cookie)
      .send({ telefono: '+573001112233' });
    expect(telefono.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('un aviso normal sale por la aplicación (entregado) y por el correo (aceptado por el proveedor)', async () => {
    const c = await nuevoCuidador(app, relojSimulado);
    const id = (
      (
        await como(app)
          .post('/api/v1/servicios')
          .set('Cookie', familia.cookie)
          .set('Idempotency-Key', clave())
          .send({
            adultoMayorId: familia.adultoMayorId,
            cuidadorId: c.cuidadorId,
            fecha: MANANA,
            jornada: 'manana',
            horas: 2,
            medioDePago: 'pasarela',
          })
      ).body as { servicio: { id: string } }
    ).servicio.id;
    await app.get(DespachadorDeEventos, { strict: false }).esperarEntregas();

    await entregarTodo(app);

    const avisos = await filas<{
      canal: string;
      estado: string;
      destinatario_id: string;
    }>(
      `select canal, estado, destinatario_id from notificaciones.notificaciones
       where parametros->>'servicioId' = $1 and destinatario_id = $2 order by canal`,
      [id, familia.persona.id],
    );
    expect(avisos).toEqual([
      {
        canal: 'app',
        estado: 'entregada',
        destinatario_id: familia.persona.id,
      },
      {
        canal: 'correo',
        estado: 'enviada',
        destinatario_id: familia.persona.id,
      },
    ]);
  });

  it('una alerta sale por TODOS los canales a la vez, y llega por al menos uno', async () => {
    const evento = nuevoId();

    const creados = await app.get(CrearAvisos, { strict: false }).ejecutar({
      eventoId: evento,
      destinatarioId: familia.persona.id,
      tipo: 'servicio_confirmado:familia',
      prioridad: 'alta',
      parametros: { fecha: MANANA, jornada: 'manana', horas: 1 },
    });
    await entregarTodo(app);

    expect(creados).toBe(5);
    const avisos = await filas<{ canal: string; estado: string }>(
      'select canal, estado from notificaciones.notificaciones where evento_id = $1 order by canal',
      [evento],
    );
    expect(avisos).toEqual([
      { canal: 'app', estado: 'entregada' },
      { canal: 'correo', estado: 'enviada' },
      { canal: 'push', estado: 'enviada' },
      { canal: 'sms', estado: 'enviada' },
      { canal: 'whatsapp', estado: 'enviada' },
    ]);
  });

  it('un aviso por SMS a quien no tiene teléfono falla de una vez, sin gastar intentos', async () => {
    const sinTelefono = await nuevaFamilia(app);
    const evento = nuevoId();
    await app.get(CrearAvisos, { strict: false }).ejecutar({
      eventoId: evento,
      destinatarioId: sinTelefono.persona.id,
      tipo: 'servicio_confirmado:familia',
      prioridad: 'alta',
      parametros: { fecha: MANANA, jornada: 'manana', horas: 1 },
    });

    await entregarTodo(app);

    const avisos = await filas<{
      canal: string;
      estado: string;
      intentos: number;
      ultimo_error: string | null;
    }>(
      `select canal, estado, intentos, ultimo_error from notificaciones.notificaciones
       where evento_id = $1 and canal in ('sms', 'whatsapp') order by canal`,
      [evento],
    );
    expect(avisos).toEqual([
      {
        canal: 'sms',
        estado: 'fallida',
        intentos: 1,
        ultimo_error: 'La persona no tiene teléfono registrado',
      },
      {
        canal: 'whatsapp',
        estado: 'fallida',
        intentos: 1,
        ultimo_error: 'La persona no tiene teléfono registrado',
      },
    ]);
  });
});

function clave(): string {
  return `clave-${nuevoId()}`;
}

// El pool de consultas lo comparten los dos bloques: se cierra una sola vez, al final del archivo.
afterAll(async () => {
  await bd.end();
});

// Envía TODO lo pendiente, no solo un lote: la base se comparte con las demás pruebas, que también dejan avisos
// pendientes, y un lote de 50 podría no incluir los de esta. Devuelve cuántos avisos tomó en total.
//
// Otra prueba que corra al mismo tiempo (Teleasistencia también envía avisos) puede tener bloqueados los avisos que
// quedan: el envío se los salta (`SKIP LOCKED`) y esta ronda tomaría cero aunque falten. Por eso, si al terminar
// todavía hay avisos pendientes, espera un momento y vuelve a intentar unas pocas veces.
async function entregarTodo(app: NestExpressApplication): Promise<number> {
  const caso = app.get(EntregarPendientes, { strict: false });
  let total = 0;
  let reintentos = 0;
  for (let vuelta = 0; vuelta < 100; vuelta++) {
    const tomadas = await caso.ejecutar();
    if (tomadas > 0) {
      total += tomadas;
      reintentos = 0;
      continue;
    }
    const { rows } = await bd.query(
      "select 1 from notificaciones.notificaciones where estado = 'pendiente' and proximo_intento_en <= now() limit 1",
    );
    if (rows.length === 0 || reintentos >= 5) break;
    reintentos += 1;
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  return total;
}
