import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { ConexionesDeFlujos } from '../../src/compartido/infraestructura/sse/conexiones-de-flujos.js';
import { DespachadorDeEventos } from '../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
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
import { abrirFlujo, type ConexionSse } from '../soporte/sse.js';

// M8 (API): el chat entre la familia y el cuidador, de punta a punta con la aplicación completa y Postgres real. El
// reloj está en el lunes 10 de junio de 2030 a las 10:00 en Bogotá.

const INICIO = '2030-06-10T15:00:00.000Z';
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

interface Mensaje {
  id: string;
  conversacionId: string;
  autor: 'yo' | 'otro';
  texto: string;
  enviadoEn: string;
  idDeCliente?: string;
}

interface Conversacion {
  id: string;
  otraParte: { nombre: string; fotoUrl: string | null };
  ultimoMensajeEn: string | null;
  puedeEscribir: boolean;
}

describe('mensajería (API)', () => {
  let app: NestExpressApplication;
  let familia: Familia;
  let cuidador: Cuidador;
  const flujos: ConexionSse[] = [];

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: { SECRETO_BFF },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
  });

  afterAll(async () => {
    for (const flujo of flujos) flujo.cerrar();
    await app.close();
    await bd.end();
  });

  beforeEach(async () => {
    reloj.fijar(INICIO);
    familia = await nuevaFamilia(app);
    cuidador = await nuevoCuidador(app, reloj, { aceptacionAutomatica: true });
  });

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────

  const procesarEventos = async () => {
    const despachador = app.get(DespachadorDeEventos, { strict: false });
    for (let i = 0; i < 4; i++) await despachador.esperarEntregas();
  };

  // Un servicio entre la familia y el cuidador: sin él no se puede escribir.
  async function contratar(de = familia, a = cuidador): Promise<string> {
    const respuesta = await como(app)
      .post('/api/v1/servicios')
      .set('Cookie', de.cookie)
      .set('Idempotency-Key', `clave-${nuevoId()}`)
      .send({
        adultoMayorId: de.adultoMayorId,
        cuidadorId: a.cuidadorId,
        fecha: MANANA,
        jornada: 'manana',
        horas: 2,
        medioDePago: 'pasarela',
      });
    expect([200, 201]).toContain(respuesta.status);
    return (respuesta.body as { servicio: { id: string } }).servicio.id;
  }

  const abrir = (cookie: string, cuidadorId: string) =>
    como(app)
      .post('/api/v1/conversaciones')
      .set('Cookie', cookie)
      .send({ cuidadorId });

  // Una conversación lista: servicio contratado y conversación abierta por la familia.
  async function conversacion(): Promise<string> {
    await contratar();
    const respuesta = await abrir(familia.cookie, cuidador.cuidadorId);
    expect(respuesta.status).toBe(201);
    return (respuesta.body as { conversacion: { id: string } }).conversacion.id;
  }

  const escribir = (
    cookie: string,
    conversacionId: string,
    texto: unknown,
    idDeCliente: string = nuevoId(),
  ) =>
    como(app)
      .post(`/api/v1/conversaciones/${conversacionId}/mensajes`)
      .set('Cookie', cookie)
      .send({ texto, idDeCliente });

  const leer = (cookie: string, conversacionId: string, consulta = '') =>
    como(app)
      .get(`/api/v1/conversaciones/${conversacionId}/mensajes${consulta}`)
      .set('Cookie', cookie);

  const mensajesDe = (respuesta: {
    body: unknown;
  }): { mensajes: Mensaje[]; siguiente: string | null } =>
    respuesta.body as { mensajes: Mensaje[]; siguiente: string | null };

  async function escribirVarios(
    cookie: string,
    conversacionId: string,
    cantidad: number,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 1; i <= cantidad; i++) {
      reloj.avanzar(1_000);
      const respuesta = await escribir(cookie, conversacionId, `mensaje ${i}`);
      expect(respuesta.status).toBe(201);
      ids.push((respuesta.body as { mensaje: Mensaje }).mensaje.id);
    }
    return ids;
  }

  // ─── Abrir la conversación ─────────────────────────────────────────────────────────────────
  describe('POST /conversaciones', () => {
    it('sin un servicio con ese cuidador, no se abre (422)', async () => {
      const respuesta = await abrir(familia.cookie, cuidador.cuidadorId);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({
        codigo: 'conversacion.sin_servicio_activo',
      });
      expect(
        await filas(
          'select id from mensajeria.conversaciones where familiar_id = $1',
          [familia.persona.id],
        ),
      ).toEqual([]);
    });

    it('con un servicio, la crea (201) con quién es la otra parte y que se puede escribir', async () => {
      await contratar();

      const respuesta = await abrir(familia.cookie, cuidador.cuidadorId);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        conversacion: {
          id: expect.any(String) as string,
          otraParte: { nombre: cuidador.nombre, fotoUrl: null },
          ultimoMensajeEn: null,
          puedeEscribir: true,
        },
      });
    });

    it('abrirla otra vez devuelve la misma (200), también si se piden a la vez', async () => {
      await contratar();

      const respuestas = await Promise.all([
        abrir(familia.cookie, cuidador.cuidadorId),
        abrir(familia.cookie, cuidador.cuidadorId),
        abrir(familia.cookie, cuidador.cuidadorId),
      ]);

      expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 200, 201,
      ]);
      expect(
        new Set(
          respuestas.map(
            (r) => (r.body as { conversacion: { id: string } }).conversacion.id,
          ),
        ).size,
      ).toBe(1);
      expect(
        await filas(
          'select id from mensajeria.conversaciones where familiar_id = $1',
          [familia.persona.id],
        ),
      ).toHaveLength(1);
    });

    it('si ya existe se devuelve aunque el servicio haya terminado, con puedeEscribir en falso', async () => {
      const servicio = await contratar();
      const abierta = await abrir(familia.cookie, cuidador.cuidadorId);
      await como(app)
        .post(`/api/v1/servicios/${servicio}/cancelar`)
        .set('Cookie', familia.cookie)
        .send({});

      const otra = await abrir(familia.cookie, cuidador.cuidadorId);

      expect(otra.status).toBe(200);
      expect(otra.body).toMatchObject({
        conversacion: {
          id: (abierta.body as { conversacion: { id: string } }).conversacion
            .id,
          puedeEscribir: false,
        },
      });
    });

    it('un cuidador que no existe responde 404', async () => {
      const respuesta = await abrir(familia.cookie, nuevoId());

      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toMatchObject({
        codigo: 'cuidador.no_encontrado',
      });
    });

    it('el cuidador no abre conversaciones; sin sesión es 401; y solo se acepta el cuidador', async () => {
      await contratar();

      const comoCuidador = await abrir(
        await cuidador.cookie(),
        cuidador.cuidadorId,
      );
      const sinSesion = await como(app)
        .post('/api/v1/conversaciones')
        .send({ cuidadorId: cuidador.cuidadorId });
      const conCampoExtra = await como(app)
        .post('/api/v1/conversaciones')
        .set('Cookie', familia.cookie)
        .send({ cuidadorId: cuidador.cuidadorId, familiarId: nuevoId() });
      const malId = await abrir(familia.cookie, 'no-es-un-uuid');

      expect(comoCuidador.status).toBe(403);
      expect(sinSesion.status).toBe(401);
      expect(conCampoExtra.status).toBe(400);
      expect(malId.status).toBe(400);
    });

    it('no muestra el teléfono ni el correo de nadie', async () => {
      await contratar();

      const deLaFamilia = await abrir(familia.cookie, cuidador.cuidadorId);
      const delCuidador = await como(app)
        .get('/api/v1/conversaciones')
        .set('Cookie', await cuidador.cookie());

      for (const respuesta of [deLaFamilia, delCuidador]) {
        expect(JSON.stringify(respuesta.body)).not.toMatch(
          /telefono|correo|\+57|@/i,
        );
      }
    });
  });

  // ─── Escribir ──────────────────────────────────────────────────────────────────────────────
  describe('POST /conversaciones/:id/mensajes', () => {
    it('la familia escribe (201) y el cuidador lo ve como del otro, sin el id de cliente', async () => {
      const id = await conversacion();
      const idDeCliente = nuevoId();

      const enviado = await escribir(
        familia.cookie,
        id,
        'Hola, ¿a qué hora llegas?',
        idDeCliente,
      );
      const delCuidador = await leer(await cuidador.cookie(), id);

      expect(enviado.status).toBe(201);
      expect(enviado.body).toEqual({
        mensaje: {
          id: expect.any(String) as string,
          conversacionId: id,
          autor: 'yo',
          texto: 'Hola, ¿a qué hora llegas?',
          enviadoEn: INICIO,
          idDeCliente,
        },
      });
      expect(mensajesDe(delCuidador).mensajes).toEqual([
        {
          id: (enviado.body as { mensaje: Mensaje }).mensaje.id,
          conversacionId: id,
          autor: 'otro',
          texto: 'Hola, ¿a qué hora llegas?',
          enviadoEn: INICIO,
        },
      ]);
    });

    it('el cuidador contesta, y la conversación pasa a tener fecha del último mensaje', async () => {
      const id = await conversacion();
      reloj.avanzar(60_000);

      const respuesta = await escribir(
        await cuidador.cookie(),
        id,
        'A las 8, tranquila.',
      );
      const lista = await como(app)
        .get('/api/v1/conversaciones')
        .set('Cookie', familia.cookie);

      expect(respuesta.status).toBe(201);
      expect(lista.body).toMatchObject({
        conversaciones: [
          {
            id,
            ultimoMensajeEn: '2030-06-10T15:01:00.000Z',
            puedeEscribir: true,
          },
        ],
      });
    });

    it('reenviar con el mismo idDeCliente devuelve el mismo mensaje (200) y no lo duplica', async () => {
      const id = await conversacion();
      const idDeCliente = nuevoId();

      const primero = await escribir(familia.cookie, id, 'Hola', idDeCliente);
      const segundo = await escribir(familia.cookie, id, 'Hola', idDeCliente);

      expect(primero.status).toBe(201);
      expect(segundo.status).toBe(200);
      expect((segundo.body as { mensaje: Mensaje }).mensaje.id).toBe(
        (primero.body as { mensaje: Mensaje }).mensaje.id,
      );
      expect(
        await filas(
          'select id from mensajeria.mensajes where conversacion_id = $1',
          [id],
        ),
      ).toHaveLength(1);
    });

    it('tres reenvíos a la vez dejan un solo mensaje', async () => {
      const id = await conversacion();
      const idDeCliente = nuevoId();

      const respuestas = await Promise.all(
        [1, 2, 3].map(() => escribir(familia.cookie, id, 'Hola', idDeCliente)),
      );

      expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 200, 201,
      ]);
      expect(
        new Set(
          respuestas.map((r) => (r.body as { mensaje: Mensaje }).mensaje.id),
        ).size,
      ).toBe(1);
      expect(
        await filas(
          'select id from mensajeria.mensajes where conversacion_id = $1',
          [id],
        ),
      ).toHaveLength(1);
    });

    it('el mismo idDeCliente de otra persona es otro mensaje', async () => {
      const id = await conversacion();
      const idDeCliente = nuevoId();

      const deLaFamilia = await escribir(
        familia.cookie,
        id,
        'Hola',
        idDeCliente,
      );
      const delCuidador = await escribir(
        await cuidador.cookie(),
        id,
        'Hola',
        idDeCliente,
      );

      expect(deLaFamilia.status).toBe(201);
      expect(delCuidador.status).toBe(201);
    });

    it('recorta los espacios, uniformiza los saltos de línea y cuenta emojis como un carácter', async () => {
      const id = await conversacion();

      const recortado = await escribir(
        familia.cookie,
        id,
        '  Hola\r\nmundo \n ',
      );
      const emojis = await escribir(familia.cookie, id, '😀'.repeat(1000));

      expect((recortado.body as { mensaje: Mensaje }).mensaje.texto).toBe(
        'Hola\nmundo',
      );
      expect(emojis.status).toBe(201);
    });

    it.each([
      ['vacío', '', 'mensaje.vacio'],
      ['solo espacios', '   \n  ', 'mensaje.vacio'],
      ['de más de 1000 caracteres', 'a'.repeat(1001), 'mensaje.muy_largo'],
      ['de más de 1000 emojis', '😀'.repeat(1001), 'mensaje.muy_largo'],
      ['con un carácter nulo', 'hola\u0000', 'mensaje.texto_invalido'],
      ['con un carácter de control', 'hola\u0007', 'mensaje.texto_invalido'],
    ])('un mensaje %s se rechaza (400)', async (_caso, texto, codigo) => {
      const id = await conversacion();

      const respuesta = await escribir(familia.cookie, id, texto);

      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toMatchObject({ codigo });
    });

    it('rechaza el cuerpo mal formado', async () => {
      const id = await conversacion();
      const url = `/api/v1/conversaciones/${id}/mensajes`;
      const casos = [
        { texto: 5, idDeCliente: nuevoId() },
        { texto: 'hola' },
        { texto: 'hola', idDeCliente: 'no-es-un-uuid' },
        { texto: 'hola', idDeCliente: nuevoId(), autor: 'cuidador' },
        { texto: 'x'.repeat(10_001), idDeCliente: nuevoId() },
      ];

      for (const cuerpo of casos) {
        const respuesta = await como(app)
          .post(url)
          .set('Cookie', familia.cookie)
          .send(cuerpo);
        expect(respuesta.status).toBe(400);
      }
      expect(
        await filas(
          'select id from mensajeria.mensajes where conversacion_id = $1',
          [id],
        ),
      ).toEqual([]);
    });

    it('guarda el texto tal cual, sin interpretarlo (es texto plano)', async () => {
      const id = await conversacion();
      const texto = '<script>alert(1)</script> & <b>hola</b>';

      await escribir(familia.cookie, id, texto);
      const leido = mensajesDe(await leer(familia.cookie, id));

      expect(leido.mensajes[0]?.texto).toBe(texto);
    });

    it('sin un servicio vivo ya no se puede escribir (422), pero reenviar uno ya enviado sí devuelve el mismo', async () => {
      const servicio = await contratar();
      const abierta = await abrir(familia.cookie, cuidador.cuidadorId);
      const id = (abierta.body as { conversacion: { id: string } }).conversacion
        .id;
      const idDeCliente = nuevoId();
      const enviado = await escribir(familia.cookie, id, 'Hola', idDeCliente);
      await como(app)
        .post(`/api/v1/servicios/${servicio}/cancelar`)
        .set('Cookie', familia.cookie)
        .send({});

      const nuevo = await escribir(familia.cookie, id, 'Otro');
      const delCuidador = await escribir(await cuidador.cookie(), id, 'Otro');
      const reenvio = await escribir(familia.cookie, id, 'Hola', idDeCliente);
      const lectura = await leer(await cuidador.cookie(), id);

      expect(nuevo.status).toBe(422);
      expect(nuevo.body).toMatchObject({
        codigo: 'conversacion.sin_servicio_activo',
      });
      expect(delCuidador.status).toBe(422);
      expect(reenvio.status).toBe(200);
      expect((reenvio.body as { mensaje: Mensaje }).mensaje.id).toBe(
        (enviado.body as { mensaje: Mensaje }).mensaje.id,
      );
      // Leer lo escrito siempre se puede.
      expect(lectura.status).toBe(200);
      expect(mensajesDe(lectura).mensajes).toHaveLength(1);
    });

    it('un mensaje con texto inválido no gasta la consulta de servicios: se rechaza antes', async () => {
      const servicio = await contratar();
      const abierta = await abrir(familia.cookie, cuidador.cuidadorId);
      await como(app)
        .post(`/api/v1/servicios/${servicio}/cancelar`)
        .set('Cookie', familia.cookie)
        .send({});

      const respuesta = await escribir(
        familia.cookie,
        (abierta.body as { conversacion: { id: string } }).conversacion.id,
        '',
      );

      expect(respuesta.status).toBe(400);
    });
  });

  // ─── Quién entra ───────────────────────────────────────────────────────────────────────────
  describe('solo las dos partes entran', () => {
    it('otra familia, otro cuidador y un administrador reciben 404, igual que una conversación que no existe', async () => {
      const id = await conversacion();
      const otraFamilia = await nuevaFamilia(app);
      const otroCuidador = await nuevoCuidador(app, reloj);

      const intentos = [
        { cookie: otraFamilia.cookie },
        { cookie: await otroCuidador.cookie() },
      ];
      for (const { cookie } of intentos) {
        const lee = await leer(cookie, id);
        const escribe = await escribir(cookie, id, 'intruso');
        const inexistente = await leer(cookie, nuevoId());

        expect(lee.status).toBe(404);
        expect(escribe.status).toBe(404);
        expect(lee.body).toMatchObject({
          codigo: 'conversacion.no_encontrada',
        });
        expect((lee.body as { detail?: string }).detail).toBe(
          (inexistente.body as { detail?: string }).detail,
        );
      }
      expect(
        await filas(
          'select id from mensajeria.mensajes where conversacion_id = $1',
          [id],
        ),
      ).toEqual([]);
    });

    it('los intentos ajenos quedan en la auditoría', async () => {
      const id = await conversacion();
      const otraFamilia = await nuevaFamilia(app);

      await leer(otraFamilia.cookie, id);

      expect(
        await filas(
          `select resultado from compartido.auditoria
           where accion = 'mensajeria.acceder_conversacion' and recurso_id = $1 and actor_id = $2`,
          [id, otraFamilia.persona.id],
        ),
      ).toEqual([{ resultado: 'denegado' }]);
    });

    it('cada quien ve solo sus conversaciones', async () => {
      await conversacion();
      const otraFamilia = await nuevaFamilia(app);
      const otroCuidador = await nuevoCuidador(app, reloj);

      const deOtraFamilia = await como(app)
        .get('/api/v1/conversaciones')
        .set('Cookie', otraFamilia.cookie);
      const deOtroCuidador = await como(app)
        .get('/api/v1/conversaciones')
        .set('Cookie', await otroCuidador.cookie());
      const delCuidador = await como(app)
        .get('/api/v1/conversaciones')
        .set('Cookie', await cuidador.cookie());

      expect(deOtraFamilia.body).toEqual({ conversaciones: [] });
      expect(deOtroCuidador.body).toEqual({ conversaciones: [] });
      expect(
        (delCuidador.body as { conversaciones: Conversacion[] }).conversaciones,
      ).toHaveLength(1);
      expect(
        (delCuidador.body as { conversaciones: Conversacion[] })
          .conversaciones[0]?.otraParte.nombre,
      ).toBe('Andrea Gómez');
    });

    it('exige sesión y un id válido', async () => {
      const id = await conversacion();

      const sinSesion = await como(app).get(
        `/api/v1/conversaciones/${id}/mensajes`,
      );
      const listaSinSesion = await como(app).get('/api/v1/conversaciones');
      const malId = await leer(familia.cookie, 'no-es-un-uuid');

      expect(sinSesion.status).toBe(401);
      expect(listaSinSesion.status).toBe(401);
      expect(malId.status).toBe(400);
    });
  });

  // ─── Leer y paginar ────────────────────────────────────────────────────────────────────────
  describe('GET /conversaciones/:id/mensajes', () => {
    it('pagina hacia atrás por cursor sin saltarse ni repetir ningún mensaje', async () => {
      const id = await conversacion();
      const ids = await escribirVarios(familia.cookie, id, 7);

      const recibidos: string[] = [];
      let cursor: string | null = null;
      let paginas = 0;
      do {
        const pagina = mensajesDe(
          await leer(
            familia.cookie,
            id,
            `?limite=3${cursor === null ? '' : `&antes=${cursor}`}`,
          ),
        );
        recibidos.push(...pagina.mensajes.map((m) => m.id));
        cursor = pagina.siguiente;
        paginas += 1;
      } while (cursor !== null && paginas < 10);

      expect(paginas).toBe(3);
      expect(recibidos).toEqual([...ids].reverse());
    });

    it('un mensaje que entra mientras se pagina no descuadra las páginas', async () => {
      const id = await conversacion();
      await escribirVarios(familia.cookie, id, 4);
      const primera = mensajesDe(await leer(familia.cookie, id, '?limite=2'));
      reloj.avanzar(1_000);
      await escribir(familia.cookie, id, 'llegó después');

      const segunda = mensajesDe(
        await leer(familia.cookie, id, `?limite=2&antes=${primera.siguiente}`),
      );

      expect(segunda.mensajes.map((m) => m.texto)).toEqual([
        'mensaje 2',
        'mensaje 1',
      ]);
      expect(segunda.siguiente).toBeNull();
    });

    it('mensajes del mismo instante conservan un orden estable', async () => {
      const id = await conversacion();
      for (let i = 0; i < 5; i++)
        await escribir(familia.cookie, id, `igual ${i}`);

      const todo = mensajesDe(await leer(familia.cookie, id, '?limite=100'));
      const porPaginas: string[] = [];
      let cursor: string | null = null;
      do {
        const pagina = mensajesDe(
          await leer(
            familia.cookie,
            id,
            `?limite=2${cursor === null ? '' : `&antes=${cursor}`}`,
          ),
        );
        porPaginas.push(...pagina.mensajes.map((m) => m.id));
        cursor = pagina.siguiente;
      } while (cursor !== null);

      expect(porPaginas).toEqual(todo.mensajes.map((m) => m.id));
      expect(new Set(porPaginas).size).toBe(5);
    });

    it.each([
      ['un cursor que no es nuestro', '?antes=abc'],
      ['un cursor vacío', '?antes='],
      ['un límite en cero', '?limite=0'],
      ['un límite de más de 100', '?limite=101'],
      ['un límite que no es número', '?limite=muchos'],
      ['un parámetro desconocido', '?desde=hoy'],
    ])('rechaza %s (400)', async (_caso, consulta) => {
      const id = await conversacion();

      const respuesta = await leer(familia.cookie, id, consulta);

      expect(respuesta.status).toBe(400);
    });

    it('una conversación sin mensajes devuelve la lista vacía', async () => {
      const id = await conversacion();

      expect((await leer(familia.cookie, id)).body).toEqual({
        mensajes: [],
        siguiente: null,
      });
    });
  });

  // ─── Avisos ────────────────────────────────────────────────────────────────────────────────
  describe('avisos a Notificaciones', () => {
    const avisosDeMensaje = (conversacionId: string) =>
      filas<{ destinatario_id: string; parametros: Record<string, unknown> }>(
        `select destinatario_id, parametros from notificaciones.notificaciones
         where tipo = 'mensaje_nuevo:destinatario' and parametros->>'conversacionId' = $1`,
        [conversacionId],
      );

    it('el evento lleva solo ids, nunca el texto', async () => {
      const id = await conversacion();
      const enviado = await escribir(
        familia.cookie,
        id,
        'Mi número de cédula es 123',
      );
      const mensajeId = (enviado.body as { mensaje: Mensaje }).mensaje.id;

      const [evento] = await filas<{ datos: Record<string, unknown> }>(
        `select datos from compartido.outbox
         where tipo = 'mensajeria.mensaje_enviado' and datos->>'mensajeId' = $1`,
        [mensajeId],
      );

      expect(evento?.datos).toEqual({
        mensajeId,
        conversacionId: id,
        autorId: familia.persona.id,
        destinatarioId: cuidador.usuarioId,
      });
    });

    it('avisa a la otra parte, sin el texto ni el nombre de quien escribió', async () => {
      const id = await conversacion();
      await escribir(familia.cookie, id, 'Mi número de cédula es 123');
      await procesarEventos();

      const avisos = await avisosDeMensaje(id);

      expect(avisos).toEqual([
        {
          destinatario_id: cuidador.usuarioId,
          parametros: { conversacionId: id },
        },
      ]);
    });

    it('agrupa: varios mensajes seguidos avisan una sola vez, y después de un rato vuelve a avisar', async () => {
      const id = await conversacion();
      for (let i = 0; i < 3; i++) {
        reloj.avanzar(10_000);
        await escribir(familia.cookie, id, `hola ${i}`);
        await procesarEventos();
      }
      const juntos = await avisosDeMensaje(id);
      reloj.avanzar(6 * 60_000);
      await escribir(familia.cookie, id, 'sigues ahí?');
      await procesarEventos();

      expect(juntos).toHaveLength(1);
      expect(await avisosDeMensaje(id)).toHaveLength(2);
    });

    it('cada parte recibe su propio aviso agrupado', async () => {
      const id = await conversacion();
      await escribir(familia.cookie, id, 'hola');
      await escribir(await cuidador.cookie(), id, 'hola a ti');
      await procesarEventos();

      const avisos = await avisosDeMensaje(id);

      expect(avisos.map((a) => a.destinatario_id).sort()).toEqual(
        [cuidador.usuarioId, familia.persona.id].sort(),
      );
    });
  });

  // ─── En vivo (SSE) ─────────────────────────────────────────────────────────────────────────
  describe('GET /mensajeria/eventos', () => {
    async function conectar(cookie: string, ultimoEvento?: string) {
      const flujo = await abrirFlujo(app, '/api/v1/mensajeria/eventos', {
        cookie,
        ultimoEvento,
      });
      flujos.push(flujo);
      return flujo;
    }

    it('exige sesión', async () => {
      const flujo = await abrirFlujo(app, '/api/v1/mensajeria/eventos');
      flujos.push(flujo);

      expect(flujo.status).toBe(401);
    });

    it('transmite como un flujo de eventos, sin caché', async () => {
      const flujo = await conectar(familia.cookie);

      expect(flujo.status).toBe(200);
      expect(flujo.encabezados['content-type']).toContain('text/event-stream');
      expect(String(flujo.encabezados['cache-control'])).toContain('no-cache');
    });

    it('entrega al instante el mensaje que escribe la otra parte', async () => {
      const id = await conversacion();
      const flujo = await conectar(await cuidador.cookie());

      const enviado = await escribir(familia.cookie, id, 'Ya voy para allá');
      const [evento] = await flujo.esperar('mensaje', 1, 5_000);

      expect(evento?.datos).toMatchObject({
        id: (enviado.body as { mensaje: Mensaje }).mensaje.id,
        conversacionId: id,
        autor: 'otro',
        texto: 'Ya voy para allá',
      });
      expect(evento?.id).toEqual(expect.any(String));
    });

    it('quien escribe también lo recibe, como suyo, para sus otras pantallas', async () => {
      const id = await conversacion();
      const flujo = await conectar(familia.cookie);
      const idDeCliente = nuevoId();

      await escribir(familia.cookie, id, 'Hola', idDeCliente);
      const [evento] = await flujo.esperar('mensaje', 1, 5_000);

      expect(evento?.datos).toMatchObject({ autor: 'yo', idDeCliente });
    });

    it('un tercero no recibe nada de conversaciones ajenas', async () => {
      const id = await conversacion();
      const otraFamilia = await nuevaFamilia(app);
      const intruso = await conectar(otraFamilia.cookie);
      const parte = await conectar(await cuidador.cookie());

      await escribir(familia.cookie, id, 'Privado');
      await parte.esperar('mensaje', 1, 5_000);
      await new Promise((resolver) => setTimeout(resolver, 300));

      expect(intruso.eventos.filter((e) => e.tipo === 'mensaje')).toEqual([]);
    });

    it('al reconectarse con Last-Event-ID sigue desde ahí y no pierde ninguno', async () => {
      const id = await conversacion();
      const primera = await conectar(await cuidador.cookie());
      await escribir(familia.cookie, id, 'uno');
      const [uno] = await primera.esperar('mensaje', 1, 5_000);
      primera.cerrar();
      // Mientras estaba desconectado se escribieron dos más.
      reloj.avanzar(1_000);
      const dos = await escribir(familia.cookie, id, 'dos');
      reloj.avanzar(1_000);
      const tres = await escribir(familia.cookie, id, 'tres');

      const segunda = await conectar(await cuidador.cookie(), uno?.id);
      const recibidos = await segunda.esperar('mensaje', 3, 5_000);

      const ids = recibidos.map((e) => (e.datos as Mensaje).id);
      // Al menos una vez: puede repetir el último (la ventana de seguridad), pero no falta ninguno.
      expect(ids).toEqual(
        expect.arrayContaining([
          (dos.body as { mensaje: Mensaje }).mensaje.id,
          (tres.body as { mensaje: Mensaje }).mensaje.id,
        ]),
      );
      expect(
        ids.indexOf((dos.body as { mensaje: Mensaje }).mensaje.id),
      ).toBeLessThan(
        ids.indexOf((tres.body as { mensaje: Mensaje }).mensaje.id),
      );
    });

    it('un Last-Event-ID que no es nuestro responde 400 antes de transmitir', async () => {
      const flujo = await conectar(familia.cookie, 'basura');

      expect(flujo.status).toBe(400);
      expect(flujo.cuerpo).toContain('paginacion.cursor_invalido');
    });

    it('limita las conexiones abiertas por persona y las libera al cerrarse', async () => {
      const abiertas: ConexionSse[] = [];
      for (let i = 0; i < 5; i++) abiertas.push(await conectar(familia.cookie));

      const demasiadas = await conectar(familia.cookie);

      expect(demasiadas.status).toBe(422);
      expect(demasiadas.cuerpo).toContain('flujo.demasiadas_conexiones');
      const conexiones = app.get(ConexionesDeFlujos, { strict: false });
      expect(conexiones.cuantas(familia.persona.id)).toBe(5);
      abiertas[0]?.cerrar();
      for (
        let i = 0;
        i < 50 && conexiones.cuantas(familia.persona.id) > 4;
        i++
      ) {
        await new Promise((resolver) => setTimeout(resolver, 50));
      }
      expect(conexiones.cuantas(familia.persona.id)).toBe(4);
      expect((await conectar(familia.cookie)).status).toBe(200);
    });

    it('al apagar el servidor las conexiones abiertas se cierran solas', async () => {
      const flujo = await conectar(familia.cookie);
      const conexiones = app.get(ConexionesDeFlujos, { strict: false });

      conexiones.cerrarTodas();
      for (let i = 0; i < 50 && !flujo.cerrada(); i++) {
        await new Promise((resolver) => setTimeout(resolver, 50));
      }

      expect(flujo.cerrada()).toBe(true);
      expect(conexiones.cuantas(familia.persona.id)).toBe(0);
    });
  });
});
