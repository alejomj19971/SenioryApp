import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { DespachadorDeEventos } from '../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import type { EntradaDeCuidadorImportado } from '../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import { ImportarCuidador } from '../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import { CrearAdministrador } from '../../src/identidad/aplicacion/casos-de-uso/crear-administrador.js';
import {
  EMISOR_DE_TOKENS,
  type EmisorDeTokens,
} from '../../src/identidad/aplicacion/puertos/salida/emisor-de-tokens.js';
import type { UsuarioId } from '../../src/identidad/dominio/ids.js';
import {
  como,
  conSesion,
  CONTRASENA,
  iniciarSesion,
  registrarFamiliar,
  sesionDe,
  SECRETO_BFF,
  type Cliente,
  type Persona,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { REVISOR_DE_PRUEBA } from '../soporte/directorio.js';
import { RelojFalso } from '../soporte/dobles.js';
import { expirarSolicitudesDe } from '../soporte/expiracion.js';

// M4 §6 (API): el ciclo de vida del servicio con la matriz de autorización. El reloj está en el lunes 10 de
// junio de 2030 a las 10:00 en Bogotá (15:00 UTC): hoy, la mañana está en curso y la tarde y la noche no han
// empezado. Las pruebas que mueven el reloj emiten sesiones nuevas (los tokens duran 15 minutos).

const INICIO = '2030-06-10T15:00:00.000Z';
const HOY = '2030-06-10';
const MANANA = '2030-06-11';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();
const TELEFONO_DEL_CUIDADOR = '+573104445566';

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

describe('servicios (API)', () => {
  let app: NestExpressApplication;
  let cliente: Cliente;
  let familia: Familia;

  interface Familia {
    persona: Persona;
    adultoMayorId: string;
    cookie: string;
  }

  interface Cuidador {
    cuidadorId: string;
    usuarioId: string;
    cookie: () => Promise<string>;
  }

  beforeAll(async () => {
    app = await crearAppDePrueba({
      variables: { SECRETO_BFF },
      ajustar: (constructor) =>
        constructor.overrideProvider(RELOJ).useValue(reloj),
    });
    // Cada llamada sale de su propia IP: los límites de peticiones son por IP y las pruebas no deben gastarse
    // el cupo unas a otras.
    cliente = {
      get: (ruta) => como(app).get(ruta),
      post: (ruta) => como(app).post(ruta),
      put: (ruta) => como(app).put(ruta),
      patch: (ruta) => como(app).patch(ruta),
      delete: (ruta) => como(app).delete(ruta),
    };
    familia = await nuevaFamilia();
  });

  afterAll(async () => {
    await app.close();
    await bd.end();
  });

  beforeEach(() => reloj.fijar(INICIO));

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────
  async function nuevaFamilia(conConsentimiento = true): Promise<Familia> {
    const c = como(app);
    const persona = await registrarFamiliar(c);
    const cookie = conSesion(persona.sesion);
    const adulto = await c
      .post('/api/v1/adultos-mayores')
      .set('Cookie', cookie)
      .send({
        nombre: 'Carmen Gómez',
        fechaDeNacimiento: '1950-03-01',
        parentesco: 'hijo_hija',
      });
    const adultoMayorId = (adulto.body as { adultoMayor: { id: string } })
      .adultoMayor.id;
    if (conConsentimiento) {
      await c
        .post(`/api/v1/adultos-mayores/${adultoMayorId}/consentimientos`)
        .set('Cookie', cookie)
        .send({
          finalidad: 'datos_de_salud',
          versionDelTexto: 'v1',
          calidad: 'representante',
        });
    }
    return { persona, adultoMayorId, cookie };
  }

  async function nuevoCuidador(
    cambios: Partial<EntradaDeCuidadorImportado> & {
      aceptacionAutomatica?: boolean;
    } = {},
  ): Promise<Cuidador> {
    const { aceptacionAutomatica, ...resto } = cambios;
    const marca = nuevoId().slice(0, 8);
    const { cuidadorId, usuarioId } = await app
      .get(ImportarCuidador, { strict: false })
      .ejecutar(
        {
          nombre: `Marta ${marca}`,
          correo: `${marca}@cuidadores.seniory.invalid`,
          telefono: TELEFONO_DEL_CUIDADOR,
          especialidad: 'enfermeria',
          titulo: 'Enfermera profesional',
          aniosExperiencia: 6,
          tarifaHora: 20_000,
          zona: `Zona${marca}`,
          disponibilidad: ['manana', 'tarde', 'noche'],
          bio: 'Cuido con paciencia.',
          controles: [
            { control: 'antecedentes', vigenteHasta: '2031-01-01' },
            { control: 'titulos', vigenteHasta: null },
            { control: 'psicotecnica', vigenteHasta: '2031-01-01' },
          ],
          ...resto,
        },
        REVISOR_DE_PRUEBA,
      );
    if (aceptacionAutomatica === true) {
      await bd.query(
        'update directorio.cuidadores set aceptacion_automatica = true where id = $1',
        [cuidadorId],
      );
    }
    return { cuidadorId, usuarioId, cookie: () => cookieDeCuidador(usuarioId) };
  }

  // El cuidador no conoce su contraseña (nace aleatoria): se le emite el token directamente.
  async function cookieDeCuidador(usuarioId: string): Promise<string> {
    const emisor = app.get<EmisorDeTokens>(EMISOR_DE_TOKENS, { strict: false });
    const { token } = await emisor.emitirAcceso(
      { id: usuarioId as UsuarioId, rol: 'cuidador' },
      reloj.ahora(),
    );
    return `seniory_acceso=${token}`;
  }

  const clave = () => `clave-${nuevoId()}`;

  const cuerpo = (
    cuidadorId: string,
    cambios: Record<string, unknown> = {},
  ) => ({
    adultoMayorId: familia.adultoMayorId,
    cuidadorId,
    fecha: MANANA,
    jornada: 'manana',
    horas: 2,
    medioDePago: 'pasarela',
    ...cambios,
  });

  const solicitar = (
    c: Cuidador,
    cambios: Record<string, unknown> = {},
    opciones: { cookie?: string; clave?: string | null } = {},
  ) => {
    let peticion = cliente
      .post('/api/v1/servicios')
      .set('Cookie', opciones.cookie ?? familia.cookie);
    if (opciones.clave !== null) {
      peticion = peticion.set('Idempotency-Key', opciones.clave ?? clave());
    }
    return peticion.send(cuerpo(c.cuidadorId, cambios));
  };

  async function crearServicio(
    c: Cuidador,
    cambios: Record<string, unknown> = {},
  ): Promise<string> {
    const respuesta = await solicitar(c, cambios);
    expect([200, 201]).toContain(respuesta.status);
    return (respuesta.body as { servicio: { id: string } }).servicio.id;
  }

  const accion = (
    ruta: string,
    id: string,
    cookie: string,
    cuerpoDeLaPeticion: object = {},
  ) =>
    como(app)
      .post(`/api/v1/servicios/${id}/${ruta}`)
      .set('Cookie', cookie)
      .send(cuerpoDeLaPeticion);

  const ver = (id: string, cookie: string) =>
    como(app).get(`/api/v1/servicios/${id}`).set('Cookie', cookie);

  const estadoEnBd = async (id: string) =>
    (
      await filas<{ estado: string; motivo_cancelacion: string | null }>(
        'select estado, motivo_cancelacion from reservas.servicios where id = $1',
        [id],
      )
    )[0];

  const eventosDe = async (servicioId: string) =>
    (
      await filas<{ tipo: string }>(
        `select tipo from compartido.outbox where datos->>'servicioId' = $1 and tipo like 'reservas.%' order by creado_en, id`,
        [servicioId],
      )
    ).map((e) => e.tipo);

  const procesarEventos = () =>
    app.get(DespachadorDeEventos, { strict: false }).esperarEntregas();

  // ─── Solicitar ─────────────────────────────────────────────────────────────────────────────
  describe('solicitar un servicio', () => {
    it('crea el servicio «solicitado» con el monto calculado por el servidor, sin lo que gana el cuidador', async () => {
      const c = await nuevoCuidador();

      const respuesta = await solicitar(c);

      expect(respuesta.status).toBe(201);
      const { servicio } = respuesta.body as {
        servicio: Record<string, unknown> & { id: string };
      };
      expect(servicio).toEqual({
        id: servicio.id,
        estado: 'solicitado',
        fecha: MANANA,
        jornada: 'manana',
        horas: 2,
        medioDePago: 'pasarela',
        solicitudExpiraEn: '2030-06-10T17:00:00.000Z', // 2 horas después
        cuidador: { id: c.cuidadorId, nombre: expect.any(String) as string },
        adultoMayor: {
          id: familia.adultoMayorId,
          nombre: 'Carmen Gómez',
          edad: 80,
        },
        solicitadoEn: INICIO,
        aceptadoEn: null,
        iniciadoEn: null,
        finalizadoEn: null,
        canceladoEn: null,
        motivoDeCancelacion: null,
        calificacion: null,
        tarifaHora: 20_000,
        subtotal: 40_000,
        cargoDeServicio: 3_200,
        totalFamilia: 43_200,
        politicaVersion: 1,
      });
      const texto = JSON.stringify(respuesta.body);
      expect(texto).not.toContain('pagoProfesional');
      expect(texto).not.toContain('36000');
      expect(texto).not.toContain('573104445566');
    });

    it('publica «servicio solicitado» y deja el historial', async () => {
      const c = await nuevoCuidador();

      const id = await crearServicio(c);

      expect(await eventosDe(id)).toEqual(['reservas.servicio_solicitado']);
      const historial = await filas(
        'select 1 from reservas.historial_de_estados where servicio_id = $1',
        [id],
      );
      expect(historial).toHaveLength(1);
    });

    it('para hoy, el cuidador tiene 30 minutos para responder', async () => {
      const c = await nuevoCuidador();

      const respuesta = await solicitar(c, { fecha: HOY, jornada: 'tarde' });

      expect(
        (respuesta.body as { servicio: { solicitudExpiraEn: string } }).servicio
          .solicitudExpiraEn,
      ).toBe('2030-06-10T15:30:00.000Z');
    });

    it('con aceptación automática nace aceptado y publica también «confirmado»', async () => {
      const c = await nuevoCuidador({ aceptacionAutomatica: true });

      const respuesta = await solicitar(c);

      expect(respuesta.status).toBe(201);
      const { servicio } = respuesta.body as {
        servicio: { id: string; estado: string; solicitudExpiraEn: null };
      };
      expect(servicio).toMatchObject({
        estado: 'aceptado',
        solicitudExpiraEn: null,
      });
      expect(await eventosDe(servicio.id)).toEqual([
        'reservas.servicio_solicitado',
        'reservas.servicio_confirmado',
      ]);
    });

    it('el cuidador lo ve en su lista con lo que él recibe, no lo que paga la familia', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);

      const respuesta = await como(app)
        .get('/api/v1/servicios')
        .set('Cookie', await c.cookie());

      expect(respuesta.status).toBe(200);
      const { servicios } = respuesta.body as {
        servicios: Record<string, unknown>[];
      };
      expect(servicios.map((s) => s.id)).toEqual([id]);
      expect(servicios[0]).toMatchObject({
        pagoProfesional: 36_000,
        tarifaHora: 20_000,
      });
      for (const campo of [
        'totalFamilia',
        'cargoDeServicio',
        'subtotal',
        'politicaVersion',
      ]) {
        expect(servicios[0]).not.toHaveProperty(campo);
      }
      expect(JSON.stringify(respuesta.body)).not.toContain('573104445566');
    });

    describe('reglas de la solicitud', () => {
      it('a las 8 p. m. en Colombia, hoy solo queda la noche (aunque en UTC ya sea mañana)', async () => {
        reloj.fijar('2030-06-11T01:00:00.000Z'); // 20:00 del 10 en Bogotá
        const nueva = await nuevaFamilia();
        const c = await nuevoCuidador();
        const pedir = (jornada: string) =>
          cliente
            .post('/api/v1/servicios')
            .set('Cookie', nueva.cookie)
            .set('Idempotency-Key', clave())
            .send({
              adultoMayorId: nueva.adultoMayorId,
              cuidadorId: c.cuidadorId,
              fecha: HOY,
              jornada,
              horas: 1,
              medioDePago: 'pasarela',
            });

        const tarde = await pedir('tarde');
        const noche = await pedir('noche');

        expect(tarde.status).toBe(422);
        expect(tarde.body).toMatchObject({
          codigo: 'servicio.franja_terminada',
        });
        expect(noche.status).toBe(201);
      });

      it('rechaza una fecha pasada con 422', async () => {
        const c = await nuevoCuidador();

        const respuesta = await solicitar(c, { fecha: '2030-06-09' });

        expect(respuesta.status).toBe(422);
        expect(respuesta.body).toMatchObject({
          codigo: 'servicio.fecha_pasada',
        });
      });

      it('rechaza una fecha de más de 180 días adelante con 422', async () => {
        const c = await nuevoCuidador();

        const respuesta = await solicitar(c, { fecha: '2031-06-10' });

        expect(respuesta.status).toBe(422);
        expect(respuesta.body).toMatchObject({
          codigo: 'servicio.fecha_muy_lejana',
        });
      });

      it('rechaza una fecha que no existe con 400', async () => {
        const c = await nuevoCuidador();

        const respuesta = await solicitar(c, { fecha: '2030-02-30' });

        expect(respuesta.status).toBe(400);
      });

      it('rechaza una jornada que el cuidador no atiende con 422', async () => {
        const c = await nuevoCuidador({ disponibilidad: ['manana'] });

        const respuesta = await solicitar(c, { jornada: 'noche' });

        expect(respuesta.status).toBe(422);
        expect(respuesta.body).toMatchObject({
          codigo: 'servicio.jornada_no_disponible',
        });
      });

      it('un cuidador que no existe o que no se muestra es 404', async () => {
        const oculto = await nuevoCuidador();
        await bd.query(
          `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
          [oculto.cuidadorId],
        );

        const r1 = await solicitar(oculto);
        const r2 = await cliente
          .post('/api/v1/servicios')
          .set('Cookie', familia.cookie)
          .set('Idempotency-Key', clave())
          .send(cuerpo(nuevoId()));

        expect(r1.status).toBe(404);
        expect(r2.status).toBe(404);
        expect(r1.body).toMatchObject({ codigo: 'cuidador.no_encontrado' });
      });

      it('una persona mayor que no es de la familia es 404, igual que si no existiera', async () => {
        const c = await nuevoCuidador();
        const ajena = await nuevaFamilia();

        const ajeno = await solicitar(c, {
          adultoMayorId: ajena.adultoMayorId,
        });
        const inexistente = await solicitar(c, { adultoMayorId: nuevoId() });

        expect(ajeno.status).toBe(404);
        expect(inexistente.status).toBe(404);
        expect(ajeno.body).toMatchObject({
          codigo: 'adulto_mayor.no_encontrado',
        });
        expect(
          await filas(
            'select 1 from reservas.servicios where adulto_mayor_id = $1',
            [ajena.adultoMayorId],
          ),
        ).toEqual([]);
      });

      it('sin consentimiento vigente para los datos de salud es 422', async () => {
        const sinConsentir = await nuevaFamilia(false);
        const c = await nuevoCuidador();

        const respuesta = await solicitar(
          c,
          {
            adultoMayorId: sinConsentir.adultoMayorId,
          },
          { cookie: sinConsentir.cookie },
        );

        expect(respuesta.status).toBe(422);
        expect(respuesta.body).toMatchObject({
          codigo: 'servicio.sin_consentimiento',
        });
      });
    });

    describe('validación de la forma', () => {
      it.each([
        ['horas en cero', { horas: 0 }],
        ['nueve horas', { horas: 9 }],
        ['horas con decimales', { horas: 1.5 }],
        ['horas en texto', { horas: '2' }],
        ['una jornada inventada', { jornada: 'madrugada' }],
        ['un medio de pago inventado', { medioDePago: 'efectivo' }],
        ['una fecha con otro formato', { fecha: '11/06/2030' }],
        ['un cuidador que no es UUID', { cuidadorId: 'marta' }],
        ['una persona mayor que no es UUID', { adultoMayorId: 'carmen' }],
      ])('rechaza %s con 400', async (_nombre, cambios) => {
        const c = await nuevoCuidador();

        const respuesta = await solicitar(c, cambios);

        expect(respuesta.status).toBe(400);
      });

      it.each([
        ['el monto', { totalFamilia: 1 }],
        ['la tarifa', { tarifaHora: 1 }],
        ['el estado', { estado: 'aceptado' }],
        ['quién es el familiar', { familiarId: nuevoId() }],
        ['la versión de la política', { politicaVersion: 1 }],
      ])(
        'el cliente no puede poner %s: el campo extra se rechaza',
        async (_nombre, extra) => {
          const c = await nuevoCuidador();

          const respuesta = await solicitar(c, extra);

          expect(respuesta.status).toBe(400);
          expect(
            await filas(
              'select 1 from reservas.servicios where cuidador_id = $1',
              [c.cuidadorId],
            ),
          ).toEqual([]);
        },
      );
    });
  });

  // ─── Idempotencia y concurrencia ───────────────────────────────────────────────────────────
  describe('idempotencia', () => {
    it('sin el encabezado Idempotency-Key es 400', async () => {
      const c = await nuevoCuidador();

      const respuesta = await solicitar(c, {}, { clave: null });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toMatchObject({ codigo: 'idempotencia.falta' });
    });

    it.each(['corta', 'con espacios no vale'])(
      'una clave inválida (%s) es 400',
      async (invalida) => {
        const c = await nuevoCuidador();

        const respuesta = await solicitar(c, {}, { clave: invalida });

        expect(respuesta.status).toBe(400);
      },
    );

    it('el mismo reintento devuelve el mismo servicio (201 y luego 200) y no crea otro', async () => {
      const c = await nuevoCuidador();
      const k = clave();

      const primera = await solicitar(c, {}, { clave: k });
      const segunda = await solicitar(c, {}, { clave: k });

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(200);
      expect(segunda.body).toEqual(primera.body);
      expect(
        await filas('select 1 from reservas.servicios where cuidador_id = $1', [
          c.cuidadorId,
        ]),
      ).toHaveLength(1);
    });

    it('el reintento sigue funcionando aunque el cuidador ya no esté disponible', async () => {
      const c = await nuevoCuidador();
      const k = clave();
      const primera = await solicitar(c, {}, { clave: k });
      await bd.query(
        `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
        [c.cuidadorId],
      );

      const segunda = await solicitar(c, {}, { clave: k });

      expect(segunda.status).toBe(200);
      expect(segunda.body).toEqual(primera.body);
    });

    it('la misma clave con OTRA solicitud es 409', async () => {
      const c = await nuevoCuidador();
      const k = clave();
      await solicitar(c, {}, { clave: k });

      const otra = await solicitar(c, { horas: 5 }, { clave: k });

      expect(otra.status).toBe(409);
      expect(otra.body).toMatchObject({ codigo: 'servicio.clave_reutilizada' });
    });

    it('cinco reintentos SIMULTÁNEOS crean un solo servicio y todos devuelven el mismo', async () => {
      const c = await nuevoCuidador();
      const k = clave();

      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () => solicitar(c, {}, { clave: k })),
      );

      const ids = new Set(
        respuestas.map(
          (r) => (r.body as { servicio: { id: string } }).servicio.id,
        ),
      );
      expect(respuestas.every((r) => [200, 201].includes(r.status))).toBe(true);
      expect(ids.size).toBe(1);
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        await filas('select 1 from reservas.servicios where cuidador_id = $1', [
          c.cuidadorId,
        ]),
      ).toHaveLength(1);
    });
  });

  describe('sin doble reserva', () => {
    it('dos familias piden a la vez el mismo cuidador y franja: una gana (201) y la otra recibe 409', async () => {
      const c = await nuevoCuidador();
      const otra = await nuevaFamilia();
      const pedir = (f: Familia) =>
        cliente
          .post('/api/v1/servicios')
          .set('Cookie', f.cookie)
          .set('Idempotency-Key', clave())
          .send(cuerpo(c.cuidadorId, { adultoMayorId: f.adultoMayorId }));

      const [a, b] = await Promise.all([pedir(familia), pedir(otra)]);

      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
      const perdedora = a.status === 409 ? a : b;
      expect(perdedora.body).toMatchObject({
        codigo: 'servicio.franja_ocupada',
      });
      expect(
        await filas('select 1 from reservas.servicios where cuidador_id = $1', [
          c.cuidadorId,
        ]),
      ).toHaveLength(1);
    });

    it('el perdedor no deja eventos en el outbox', async () => {
      const c = await nuevoCuidador();
      const primero = await crearServicio(c);

      const segundo = await solicitar(c);

      expect(segundo.status).toBe(409);
      const eventos = await filas(
        `select 1 from compartido.outbox where tipo = 'reservas.servicio_solicitado' and datos->>'cuidadorId' = $1`,
        [c.cuidadorId],
      );
      expect(eventos).toHaveLength(1);
      expect(await eventosDe(primero)).toHaveLength(1);
    });

    it('otra franja del mismo cuidador sí se puede', async () => {
      const c = await nuevoCuidador();
      await crearServicio(c, { jornada: 'manana' });

      const respuesta = await solicitar(c, { jornada: 'tarde' });

      expect(respuesta.status).toBe(201);
    });
  });

  // ─── Acciones del cuidador ─────────────────────────────────────────────────────────────────
  describe('acciones del cuidador', () => {
    it('aceptar: queda aceptado, sin plazo, y publica «confirmado»', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);

      const respuesta = await accion('aceptar', id, await c.cookie());

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        servicio: {
          estado: 'aceptado',
          aceptadoEn: INICIO,
          solicitudExpiraEn: null,
        },
      });
      expect(await eventosDe(id)).toEqual([
        'reservas.servicio_solicitado',
        'reservas.servicio_confirmado',
      ]);
    });

    it('rechazar: cancela con motivo «rechazada», libera la franja y avisa', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);

      const respuesta = await accion('rechazar', id, await c.cookie());

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        servicio: { estado: 'cancelado', motivoDeCancelacion: 'rechazada' },
      });
      expect(await eventosDe(id)).toEqual([
        'reservas.servicio_solicitado',
        'reservas.servicio_cancelado',
      ]);
      expect((await solicitar(c)).status).toBe(201);
    });

    it('la respuesta del cuidador muestra lo que recibe, no lo que paga la familia', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);

      const respuesta = await accion('aceptar', id, await c.cookie());

      const { servicio } = respuesta.body as {
        servicio: Record<string, unknown>;
      };
      expect(servicio.pagoProfesional).toBe(36_000);
      for (const campo of ['totalFamilia', 'cargoDeServicio', 'subtotal']) {
        expect(servicio).not.toHaveProperty(campo);
      }
    });

    it('no puede aceptar una solicitud cuyo plazo ya venció, aunque la tarea no haya corrido (409)', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);
      reloj.avanzar(2 * 60 * 60_000 + 1000);

      const respuesta = await accion('aceptar', id, await c.cookie());

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({
        codigo: 'servicio.solicitud_expirada',
      });
      expect((await estadoEnBd(id))?.estado).toBe('solicitado');
    });

    it('no puede aceptar si dejó de estar verificado', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);
      await bd.query(
        `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
        [c.cuidadorId],
      );

      const respuesta = await accion('aceptar', id, await c.cookie());

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({
        codigo: 'servicio.cuidador_no_disponible',
      });
    });

    it('iniciar dentro de la franja, finalizar, y cada paso publica su evento', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c, { fecha: HOY, jornada: 'manana' });
      await accion('aceptar', id, await c.cookie());

      const iniciado = await accion('iniciar', id, await c.cookie());
      reloj.avanzar(60 * 60_000);
      const finalizado = await accion('finalizar', id, await c.cookie());

      expect(iniciado.body).toMatchObject({
        servicio: { estado: 'en_curso', iniciadoEn: INICIO },
      });
      expect(finalizado.body).toMatchObject({
        servicio: {
          estado: 'finalizado',
          finalizadoEn: '2030-06-10T16:00:00.000Z',
        },
      });
      expect(await eventosDe(id)).toEqual([
        'reservas.servicio_solicitado',
        'reservas.servicio_confirmado',
        'reservas.servicio_iniciado',
        'reservas.servicio_finalizado',
      ]);
    });

    it('no se puede iniciar fuera de la franja (422)', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c, { fecha: MANANA });
      await accion('aceptar', id, await c.cookie());

      const respuesta = await accion('iniciar', id, await c.cookie());

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({
        codigo: 'servicio.fuera_de_la_franja',
      });
    });

    it.each([
      ['iniciar', 'solicitado'],
      ['finalizar', 'solicitado'],
    ])('no se puede %s un servicio %s (409)', async (ruta) => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c, { fecha: HOY, jornada: 'manana' });

      const respuesta = await accion(ruta, id, await c.cookie());

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({
        codigo: 'servicio.transicion_invalida',
      });
    });

    it('aceptar dos veces es 409', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);
      await accion('aceptar', id, await c.cookie());

      const otra = await accion('aceptar', id, await c.cookie());

      expect(otra.status).toBe(409);
    });
  });

  describe('cancelar por la familia', () => {
    it.each([['solicitado'], ['aceptado']])(
      'cancela un servicio %s, avisa con las horas de anticipación y libera la franja',
      async (estado) => {
        const c = await nuevoCuidador();
        const id = await crearServicio(c);
        if (estado === 'aceptado')
          await accion('aceptar', id, await c.cookie());

        const respuesta = await accion('cancelar', id, familia.cookie);

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toMatchObject({
          servicio: {
            estado: 'cancelado',
            motivoDeCancelacion: 'cancelada_por_familia',
          },
        });
        const [evento] = await filas<{
          datos: { motivo: string; horasDeAnticipacion: number };
        }>(
          `select datos from compartido.outbox where tipo = 'reservas.servicio_cancelado' and datos->>'servicioId' = $1`,
          [id],
        );
        // Mañana a las 06:00; son las 10:00 de hoy: faltan 20 horas.
        expect(evento?.datos).toMatchObject({
          motivo: 'cancelada_por_familia',
          horasDeAnticipacion: 20,
        });
        expect((await solicitar(c)).status).toBe(201);
      },
    );

    it('un servicio en curso o terminado ya no se cancela (409)', async () => {
      const c = await nuevoCuidador();
      const enCurso = await crearServicio(c, { fecha: HOY, jornada: 'manana' });
      await accion('aceptar', enCurso, await c.cookie());
      await accion('iniciar', enCurso, await c.cookie());

      const r1 = await accion('cancelar', enCurso, familia.cookie);
      await accion('finalizar', enCurso, await c.cookie());
      const r2 = await accion('cancelar', enCurso, familia.cookie);

      expect(r1.status).toBe(409);
      expect(r2.status).toBe(409);
    });
  });

  // ─── Expiración ────────────────────────────────────────────────────────────────────────────
  describe('expiración de solicitudes', () => {
    // Solo sobre los servicios de la prueba: la base se comparte con otros archivos que corren a la vez.
    const expirar = (...ids: string[]) =>
      expirarSolicitudesDe(app, ids).ejecutar();

    it('cancela con motivo «expirada», avisa, y la franja queda libre', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);
      reloj.avanzar(2 * 60 * 60_000);

      const resultado = await expirar(id);

      expect(resultado.expiradas).toBe(1);
      expect(resultado.fallidas).toBe(0);
      expect(await estadoEnBd(id)).toEqual({
        estado: 'cancelado',
        motivo_cancelacion: 'expirada',
      });
      expect(await eventosDe(id)).toEqual([
        'reservas.servicio_solicitado',
        'reservas.servicio_cancelado',
      ]);
      // Pasaron dos horas: la sesión de la familia ya venció, entra otra vez.
      const cookie = conSesion(
        await iniciarSesion(cliente, familia.persona.correo),
      );
      expect((await solicitar(c, {}, { cookie })).status).toBe(201);
    });

    it('una solicitud para hoy expira a los 30 minutos', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c, { fecha: HOY, jornada: 'tarde' });

      reloj.avanzar(29 * 60_000);
      await expirar(id);
      const antes = (await estadoEnBd(id))?.estado;
      reloj.avanzar(2 * 60_000);
      await expirar(id);

      expect(antes).toBe('solicitado');
      expect((await estadoEnBd(id))?.estado).toBe('cancelado');
    });

    it('no toca las que el cuidador ya aceptó ni las que siguen vigentes, y repetir no duplica el aviso', async () => {
      const c1 = await nuevoCuidador();
      const c2 = await nuevoCuidador();
      const aceptada = await crearServicio(c1);
      const vigente = await crearServicio(c2);
      await accion('aceptar', aceptada, await c1.cookie());
      reloj.avanzar(60 * 60_000); // una hora: el plazo es de dos

      await expirar(aceptada, vigente);
      await expirar(aceptada, vigente);

      expect((await estadoEnBd(aceptada))?.estado).toBe('aceptado');
      expect((await estadoEnBd(vigente))?.estado).toBe('solicitado');
    });

    it('si el cuidador acepta justo antes, la tarea no la pisa', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c);
      await accion('aceptar', id, await c.cookie());
      reloj.avanzar(3 * 60 * 60_000);

      await expirar(id);

      expect((await estadoEnBd(id))?.estado).toBe('aceptado');
    });
  });

  // ─── Calificar ─────────────────────────────────────────────────────────────────────────────
  describe('calificar', () => {
    async function servicioFinalizado() {
      const c = await nuevoCuidador();
      const id = await crearServicio(c, { fecha: HOY, jornada: 'manana' });
      await accion('aceptar', id, await c.cookie());
      await accion('iniciar', id, await c.cookie());
      await accion('finalizar', id, await c.cookie());
      return { c, id };
    }

    it('guarda la calificación, la muestra en el servicio y crea la reseña del cuidador', async () => {
      const { c, id } = await servicioFinalizado();

      const respuesta = await accion('calificacion', id, familia.cookie, {
        calificacion: 5,
        comentario: 'Excelente trato.',
      });
      await procesarEventos();

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        calificacion: { calificacion: 5, comentario: 'Excelente trato.' },
      });
      expect((await ver(id, familia.cookie)).body).toMatchObject({
        servicio: { calificacion: { calificacion: 5 } },
      });
      // Directorio reaccionó al evento: reseña con el autor abreviado y promedio actualizado.
      const [resena] = await filas<{
        autor_visible: string;
        calificacion: number;
      }>(
        'select autor_visible, calificacion from directorio.resenas where servicio_id = $1',
        [id],
      );
      expect(resena).toEqual({ autor_visible: 'Andrea G.', calificacion: 5 });
      const [cuidador] = await filas<{
        cantidad_resenas: number;
        servicios_completados: number;
      }>(
        'select cantidad_resenas, servicios_completados from directorio.cuidadores where id = $1',
        [c.cuidadorId],
      );
      // También se sumó el servicio terminado, por el evento «finalizado».
      expect(cuidador).toEqual({
        cantidad_resenas: 1,
        servicios_completados: 1,
      });
    });

    it('el comentario es opcional', async () => {
      const { id } = await servicioFinalizado();

      const respuesta = await accion('calificacion', id, familia.cookie, {
        calificacion: 4,
      });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        calificacion: { calificacion: 4, comentario: null },
      });
    });

    it('se califica una sola vez (409)', async () => {
      const { id } = await servicioFinalizado();
      await accion('calificacion', id, familia.cookie, { calificacion: 5 });

      const otra = await accion('calificacion', id, familia.cookie, {
        calificacion: 1,
      });

      expect(otra.status).toBe(409);
      expect(otra.body).toMatchObject({ codigo: 'calificacion.ya_existe' });
    });

    it.each(['solicitado', 'aceptado', 'en_curso', 'cancelado'])(
      'un servicio %s todavía no se califica (409)',
      async (estado) => {
        const c = await nuevoCuidador();
        const id = await crearServicio(c, { fecha: HOY, jornada: 'manana' });
        if (estado !== 'solicitado')
          await accion('aceptar', id, await c.cookie());
        if (estado === 'en_curso')
          await accion('iniciar', id, await c.cookie());
        if (estado === 'cancelado')
          await accion('cancelar', id, familia.cookie);

        const respuesta = await accion('calificacion', id, familia.cookie, {
          calificacion: 5,
        });

        expect(respuesta.status).toBe(409);
        expect(respuesta.body).toMatchObject({
          codigo: 'servicio.no_finalizado',
        });
      },
    );

    it.each([
      ['0', { calificacion: 0 }],
      ['6', { calificacion: 6 }],
      ['3,5', { calificacion: 3.5 }],
      ['en texto', { calificacion: '5' }],
      ['sin valor', {}],
      ['con un campo extra', { calificacion: 5, servicioId: nuevoId() }],
    ])('rechaza una calificación %s con 400', async (_nombre, cuerpoMalo) => {
      const { id } = await servicioFinalizado();

      const respuesta = await accion(
        'calificacion',
        id,
        familia.cookie,
        cuerpoMalo,
      );

      expect(respuesta.status).toBe(400);
    });

    it('rechaza un comentario de más de 500 caracteres con 400', async () => {
      const { id } = await servicioFinalizado();

      const respuesta = await accion('calificacion', id, familia.cookie, {
        calificacion: 5,
        comentario: 'a'.repeat(501),
      });

      expect(respuesta.status).toBe(400);
    });
  });

  // ─── Autorización ──────────────────────────────────────────────────────────────────────────
  describe('matriz de autorización', () => {
    const acciones = [
      ['aceptar', 'cuidador'],
      ['rechazar', 'cuidador'],
      ['iniciar', 'cuidador'],
      ['finalizar', 'cuidador'],
      ['cancelar', 'familiar'],
      ['calificacion', 'familiar'],
    ] as const;

    it.each(acciones)(
      'POST /servicios/:id/%s sin sesión es 401',
      async (ruta) => {
        const respuesta = await como(app)
          .post(`/api/v1/servicios/${nuevoId()}/${ruta}`)
          .send({});

        expect(respuesta.status).toBe(401);
      },
    );

    it.each(['/api/v1/servicios', `/api/v1/servicios/${nuevoId()}`])(
      'GET %s sin sesión es 401',
      async (ruta) => {
        expect((await como(app).get(ruta)).status).toBe(401);
      },
    );

    it('POST /servicios sin sesión es 401', async () => {
      const r = await como(app)
        .post('/api/v1/servicios')
        .set('Idempotency-Key', clave())
        .send({});

      expect(r.status).toBe(401);
    });

    it('un cuidador no puede solicitar un servicio (403)', async () => {
      const c = await nuevoCuidador();

      const respuesta = await solicitar(c, {}, { cookie: await c.cookie() });

      expect(respuesta.status).toBe(403);
    });

    it.each(acciones)(
      '%s con el rol equivocado es 403',
      async (ruta, rolDeLaRuta) => {
        const c = await nuevoCuidador();
        const id = await crearServicio(c);
        const cookieEquivocada =
          rolDeLaRuta === 'cuidador' ? familia.cookie : await c.cookie();

        const respuesta = await accion(ruta, id, cookieEquivocada, {
          calificacion: 5,
        });

        expect(respuesta.status).toBe(403);
      },
    );

    it('un administrador no usa estas rutas (403)', async () => {
      const correo = `${nuevoId()}@admin.seniory.invalid`;
      await app.get(CrearAdministrador, { strict: false }).ejecutar({
        nombre: 'Laura Administradora',
        correo,
        contrasena: CONTRASENA,
      });
      const login = await cliente
        .post('/api/v1/auth/login')
        .send({ correo, contrasena: CONTRASENA });
      const cookie = conSesion(sesionDe(login));
      const c = await nuevoCuidador();
      const id = await crearServicio(c);

      expect((await ver(id, cookie)).status).toBe(403);
      expect((await solicitar(c, {}, { cookie })).status).toBe(403);
      expect((await accion('aceptar', id, cookie)).status).toBe(403);
    });

    describe('un servicio ajeno es 404, igual que uno que no existe', () => {
      it('otro cuidador no puede aceptar, rechazar, iniciar ni finalizar', async () => {
        const c = await nuevoCuidador();
        const intruso = await nuevoCuidador();
        const id = await crearServicio(c, { fecha: HOY, jornada: 'manana' });

        for (const ruta of ['aceptar', 'rechazar', 'iniciar', 'finalizar']) {
          const respuesta = await accion(ruta, id, await intruso.cookie());
          expect(respuesta.status).toBe(404);
          expect(respuesta.body).toMatchObject({
            codigo: 'servicio.no_encontrado',
          });
        }
        expect((await estadoEnBd(id))?.estado).toBe('solicitado');
      });

      it('otra familia no puede ver, cancelar ni calificar', async () => {
        const c = await nuevoCuidador();
        const id = await crearServicio(c);
        const otra = await nuevaFamilia();

        expect((await ver(id, otra.cookie)).status).toBe(404);
        expect((await accion('cancelar', id, otra.cookie)).status).toBe(404);
        expect(
          (await accion('calificacion', id, otra.cookie, { calificacion: 5 }))
            .status,
        ).toBe(404);
        expect((await estadoEnBd(id))?.estado).toBe('solicitado');
      });

      it('un cuidador ajeno no puede ver el servicio y una familia ajena tampoco', async () => {
        const c = await nuevoCuidador();
        const intruso = await nuevoCuidador();
        const id = await crearServicio(c);

        expect((await ver(id, await intruso.cookie())).status).toBe(404);
      });

      it('el 404 de uno ajeno es idéntico al de uno inexistente', async () => {
        const c = await nuevoCuidador();
        const id = await crearServicio(c);
        const otra = await nuevaFamilia();

        const ajeno = await ver(id, otra.cookie);
        const inexistente = await ver(nuevoId(), otra.cookie);

        expect(ajeno.status).toBe(inexistente.status);
        // Lo único que cambia es el identificador de la petición.
        const sinCorrelacion = (cuerpo: object) => ({
          ...cuerpo,
          idDeCorrelacion: undefined,
        });
        expect(sinCorrelacion(ajeno.body as object)).toEqual(
          sinCorrelacion(inexistente.body as object),
        );
      });

      it('los intentos ajenos quedan en la auditoría', async () => {
        const c = await nuevoCuidador();
        const id = await crearServicio(c);
        const otra = await nuevaFamilia();

        await accion('cancelar', id, otra.cookie);

        const auditoria = await filas(
          `select 1 from compartido.auditoria where accion = 'reservas.cancelar_servicio' and recurso_id = $1 and resultado = 'denegado'`,
          [id],
        );
        expect(auditoria).toHaveLength(1);
      });
    });

    it('un identificador que no es UUID es 400', async () => {
      expect((await ver('no-es-uuid', familia.cookie)).status).toBe(400);
      expect(
        (await accion('cancelar', 'no-es-uuid', familia.cookie)).status,
      ).toBe(400);
    });
  });

  // ─── Consultar ─────────────────────────────────────────────────────────────────────────────
  describe('mis servicios y detalle', () => {
    it('la familia ve el servicio y la lista con paginación y filtro por estado', async () => {
      const nueva = await nuevaFamilia();
      const c = await nuevoCuidador();
      const pedir = (cambios: Record<string, unknown>) =>
        cliente
          .post('/api/v1/servicios')
          .set('Cookie', nueva.cookie)
          .set('Idempotency-Key', clave())
          .send({
            adultoMayorId: nueva.adultoMayorId,
            cuidadorId: c.cuidadorId,
            fecha: MANANA,
            jornada: 'manana',
            horas: 1,
            medioDePago: 'pasarela',
            ...cambios,
          });
      const ids = [];
      for (const jornada of ['manana', 'tarde', 'noche']) {
        reloj.avanzar(1000);
        ids.push(
          ((await pedir({ jornada })).body as { servicio: { id: string } })
            .servicio.id,
        );
      }
      await accion('cancelar', ids[0]!, nueva.cookie);

      const primera = await cliente
        .get('/api/v1/servicios?limite=2')
        .set('Cookie', nueva.cookie);
      const { servicios: pagina1, siguiente } = primera.body as {
        servicios: { id: string }[];
        siguiente: string;
      };
      const segunda = await cliente
        .get(`/api/v1/servicios?limite=2&cursor=${siguiente}`)
        .set('Cookie', nueva.cookie);
      const canceladas = await cliente
        .get('/api/v1/servicios?estado=cancelado')
        .set('Cookie', nueva.cookie);

      expect(pagina1.map((s) => s.id)).toEqual([ids[2], ids[1]]);
      expect(
        (segunda.body as { servicios: { id: string }[] }).servicios.map(
          (s) => s.id,
        ),
      ).toEqual([ids[0]]);
      expect(
        (segunda.body as { siguiente: string | null }).siguiente,
      ).toBeNull();
      expect(
        (canceladas.body as { servicios: { id: string }[] }).servicios.map(
          (s) => s.id,
        ),
      ).toEqual([ids[0]]);
    });

    it('no mezcla los servicios de otra familia', async () => {
      const c = await nuevoCuidador();
      await crearServicio(c);
      const otra = await nuevaFamilia();

      const respuesta = await cliente
        .get('/api/v1/servicios')
        .set('Cookie', otra.cookie);

      expect(respuesta.body).toEqual({ servicios: [], siguiente: null });
    });

    it('un cuidador sin servicios ve una lista vacía', async () => {
      const c = await nuevoCuidador();

      const respuesta = await cliente
        .get('/api/v1/servicios')
        .set('Cookie', await c.cookie());

      expect(respuesta.body).toEqual({ servicios: [], siguiente: null });
    });

    it.each([
      ['un límite de cero', 'limite=0'],
      ['un límite que pasa el máximo', 'limite=51'],
      ['un estado inventado', 'estado=perdido'],
      ['un cursor inventado', 'cursor=esto-no-es-un-cursor'],
      ['un parámetro que no existe', 'rol=administrador'],
    ])('rechaza %s con 400', async (_nombre, consulta) => {
      const respuesta = await cliente
        .get(`/api/v1/servicios?${consulta}`)
        .set('Cookie', familia.cookie);

      expect(respuesta.status).toBe(400);
    });

    it('el detalle trae la calificación cuando existe', async () => {
      const c = await nuevoCuidador();
      const id = await crearServicio(c, { fecha: HOY, jornada: 'manana' });
      await accion('aceptar', id, await c.cookie());
      await accion('iniciar', id, await c.cookie());
      await accion('finalizar', id, await c.cookie());
      await accion('calificacion', id, familia.cookie, {
        calificacion: 4,
        comentario: 'Bien.',
      });

      const familiar = await ver(id, familia.cookie);
      const cuidador = await ver(id, await c.cookie());

      expect(familiar.body).toMatchObject({
        servicio: {
          estado: 'finalizado',
          calificacion: { calificacion: 4, comentario: 'Bien.' },
        },
      });
      expect(cuidador.body).toMatchObject({
        servicio: {
          calificacion: { calificacion: 4 },
          pagoProfesional: 36_000,
        },
      });
    });
  });

  // ─── Cuidador en turno ─────────────────────────────────────────────────────────────────────
  describe('cuidador en turno (H4)', () => {
    const enTurno = (cookie: string, adultoMayorId: string) =>
      como(app)
        .get(`/api/v1/adultos-mayores/${adultoMayorId}/cuidador-en-turno`)
        .set('Cookie', cookie);

    it('con un servicio aceptado cuya franja es ahora, entrega al cuidador CON su teléfono', async () => {
      const nueva = await nuevaFamilia();
      const c = await nuevoCuidador();
      const id = (
        (
          await cliente
            .post('/api/v1/servicios')
            .set('Cookie', nueva.cookie)
            .set('Idempotency-Key', clave())
            .send({
              adultoMayorId: nueva.adultoMayorId,
              cuidadorId: c.cuidadorId,
              fecha: HOY,
              jornada: 'manana',
              horas: 2,
              medioDePago: 'pasarela',
            })
        ).body as { servicio: { id: string } }
      ).servicio.id;
      await accion('aceptar', id, await c.cookie());

      const respuesta = await enTurno(nueva.cookie, nueva.adultoMayorId);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        cuidadorEnTurno: {
          servicio: { id, estado: 'aceptado' },
          cuidador: {
            id: c.cuidadorId,
            telefono: TELEFONO_DEL_CUIDADOR,
            especialidad: 'enfermeria',
            fotoUrl: null,
          },
        },
      });
    });

    it('sin servicio activo ahora, responde 200 con null', async () => {
      const nueva = await nuevaFamilia();

      const respuesta = await enTurno(nueva.cookie, nueva.adultoMayorId);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ cuidadorEnTurno: null });
    });

    it('un servicio solicitado (sin aceptar) o de otra franja no cuenta', async () => {
      const nueva = await nuevaFamilia();
      const c = await nuevoCuidador();
      const pedir = (jornada: string) =>
        cliente
          .post('/api/v1/servicios')
          .set('Cookie', nueva.cookie)
          .set('Idempotency-Key', clave())
          .send({
            adultoMayorId: nueva.adultoMayorId,
            cuidadorId: c.cuidadorId,
            fecha: HOY,
            jornada,
            horas: 1,
            medioDePago: 'pasarela',
          });
      await pedir('manana'); // solicitado: aún no confirmado
      const tarde = (
        (await pedir('tarde')).body as { servicio: { id: string } }
      ).servicio.id;
      await accion('aceptar', tarde, await c.cookie()); // aceptado pero es la tarde, y son las 10:00

      const respuesta = await enTurno(nueva.cookie, nueva.adultoMayorId);

      expect(respuesta.body).toEqual({ cuidadorEnTurno: null });
    });

    it('la noche de ayer sigue en turno de madrugada (cruza la medianoche)', async () => {
      reloj.fijar('2030-06-09T20:00:00.000Z'); // 15:00 del 9
      const nueva = await nuevaFamilia();
      const c = await nuevoCuidador();
      const id = (
        (
          await cliente
            .post('/api/v1/servicios')
            .set('Cookie', nueva.cookie)
            .set('Idempotency-Key', clave())
            .send({
              adultoMayorId: nueva.adultoMayorId,
              cuidadorId: c.cuidadorId,
              fecha: '2030-06-09',
              jornada: 'noche',
              horas: 8,
              medioDePago: 'pasarela',
            })
        ).body as { servicio: { id: string } }
      ).servicio.id;
      await accion('aceptar', id, await c.cookie());

      reloj.fijar('2030-06-10T08:00:00.000Z'); // 03:00 del 10
      const propia = await enTurno(
        conSesion(await iniciarSesion(cliente, nueva.persona.correo)),
        nueva.adultoMayorId,
      );
      reloj.fijar('2030-06-10T11:30:00.000Z'); // 06:30 del 10: la noche ya terminó
      const despues = await enTurno(
        conSesion(await iniciarSesion(cliente, nueva.persona.correo)),
        nueva.adultoMayorId,
      );

      expect(propia.body).toMatchObject({
        cuidadorEnTurno: { servicio: { id } },
      });
      expect(despues.body).toEqual({ cuidadorEnTurno: null });
    });

    it('un servicio finalizado o cancelado deja de estar en turno de inmediato', async () => {
      const nueva = await nuevaFamilia();
      const c = await nuevoCuidador();
      const id = (
        (
          await cliente
            .post('/api/v1/servicios')
            .set('Cookie', nueva.cookie)
            .set('Idempotency-Key', clave())
            .send({
              adultoMayorId: nueva.adultoMayorId,
              cuidadorId: c.cuidadorId,
              fecha: HOY,
              jornada: 'manana',
              horas: 1,
              medioDePago: 'pasarela',
            })
        ).body as { servicio: { id: string } }
      ).servicio.id;
      await accion('aceptar', id, await c.cookie());
      await accion('iniciar', id, await c.cookie());
      const durante = await enTurno(nueva.cookie, nueva.adultoMayorId);

      await accion('finalizar', id, await c.cookie());
      const despues = await enTurno(nueva.cookie, nueva.adultoMayorId);

      expect(
        (durante.body as { cuidadorEnTurno: unknown }).cuidadorEnTurno,
      ).not.toBeNull();
      expect(despues.body).toEqual({ cuidadorEnTurno: null });
    });

    it('una persona mayor que no es de la familia es 404', async () => {
      const otra = await nuevaFamilia();

      expect((await enTurno(familia.cookie, otra.adultoMayorId)).status).toBe(
        404,
      );
      expect((await enTurno(familia.cookie, nuevoId())).status).toBe(404);
    });

    it('sin sesión es 401 y un cuidador no usa esta ruta (403)', async () => {
      const c = await nuevoCuidador();

      expect(
        (
          await como(app).get(
            `/api/v1/adultos-mayores/${familia.adultoMayorId}/cuidador-en-turno`,
          )
        ).status,
      ).toBe(401);
      expect(
        (await enTurno(await c.cookie(), familia.adultoMayorId)).status,
      ).toBe(403);
    });
  });

  // ─── Recorrido completo ────────────────────────────────────────────────────────────────────
  it('recorrido completo: solicitar → aceptar → iniciar → finalizar → calificar', async () => {
    const c = await nuevoCuidador();
    const creado = await solicitar(c, {
      fecha: HOY,
      jornada: 'manana',
      horas: 3,
    });
    const id = (creado.body as { servicio: { id: string } }).servicio.id;

    await accion('aceptar', id, await c.cookie());
    await accion('iniciar', id, await c.cookie());
    await accion('finalizar', id, await c.cookie());
    const calificado = await accion('calificacion', id, familia.cookie, {
      calificacion: 5,
    });
    await procesarEventos();

    expect(creado.status).toBe(201);
    expect(calificado.status).toBe(201);
    expect(await estadoEnBd(id)).toEqual({
      estado: 'finalizado',
      motivo_cancelacion: null,
    });
    const historial = await filas<{ hacia: string }>(
      'select hacia from reservas.historial_de_estados where servicio_id = $1 order by ocurrido_en, hacia',
      [id],
    );
    expect(historial.map((h) => h.hacia).sort()).toEqual([
      'aceptado',
      'en_curso',
      'finalizado',
      'solicitado',
    ]);
    expect(await eventosDe(id)).toEqual([
      'reservas.servicio_solicitado',
      'reservas.servicio_confirmado',
      'reservas.servicio_iniciado',
      'reservas.servicio_finalizado',
      'reservas.servicio_calificado',
    ]);
  });
});
