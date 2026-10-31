import type { NestExpressApplication } from '@nestjs/platform-express';
import type { QueryResultRow } from 'pg';
import { RELOJ } from '../../src/compartido/aplicacion/puertos/reloj.js';
import { DespachadorDeEventos } from '../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { CrearAdministrador } from '../../src/identidad/aplicacion/casos-de-uso/crear-administrador.js';
import { EntregarPendientes } from '../../src/notificaciones/aplicacion/casos-de-uso/entregar-pendientes.js';
import { OmitirTomasVencidas } from '../../src/teleasistencia/aplicacion/casos-de-uso/tomas.js';
import {
  como,
  conSesion,
  CONTRASENA,
  iniciarSesion,
  sesionDe,
  SECRETO_BFF,
} from '../soporte/api.js';
import { crearAppDePrueba } from '../soporte/app.js';
import { conectarBd, nuevoId } from '../soporte/bd.js';
import { RelojFalso } from '../soporte/dobles.js';
import {
  nuevaFamilia,
  nuevoCuidador,
  type Cuidador,
  type Familia,
} from '../soporte/escenario.js';

// M6 §6 (API): la matriz de acceso (E6), el plan de medicamentos, los signos vitales y las alertas (E11), de
// punta a punta con la aplicación completa y Postgres real. El reloj está en el lunes 10 de junio de 2030 a las
// 10:00 en Bogotá (15:00 UTC).

const INICIO = '2030-06-10T15:00:00.000Z';
const HOY = '2030-06-10';
const reloj = new RelojFalso(INICIO);
const bd = conectarBd();

async function filas<T extends QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await bd.query<T>(texto, parametros);
  return rows;
}

const clave = () => `clave-${nuevoId()}`;

const MEDICAMENTO = {
  nombre: 'Losartán',
  dosis: '50 mg',
  indicaciones: 'Con el desayuno',
  horarios: ['08:00', '20:00'],
};

describe('teleasistencia (API)', () => {
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
    await bd.end();
  });

  beforeEach(() => reloj.fijar(INICIO));

  // ─── Ayudas ────────────────────────────────────────────────────────────────────────────────
  const get = (ruta: string, cookie: string) =>
    como(app).get(`/api/v1${ruta}`).set('Cookie', cookie);
  const post = (ruta: string, cookie: string, cuerpo: object = {}) =>
    como(app).post(`/api/v1${ruta}`).set('Cookie', cookie).send(cuerpo);
  const patch = (ruta: string, cookie: string, cuerpo: object = {}) =>
    como(app).patch(`/api/v1${ruta}`).set('Cookie', cookie).send(cuerpo);
  const put = (ruta: string, cookie: string, cuerpo: object = {}) =>
    como(app).put(`/api/v1${ruta}`).set('Cookie', cookie).send(cuerpo);

  const procesarEventos = () =>
    app.get(DespachadorDeEventos, { strict: false }).esperarEntregas();

  // Envía TODO lo pendiente: la base se comparte con las demás pruebas, que también dejan avisos pendientes.
  async function entregarTodo(): Promise<void> {
    const caso = app.get(EntregarPendientes, { strict: false });
    for (let vuelta = 0; vuelta < 100; vuelta++) {
      if ((await caso.ejecutar()) === 0) break;
    }
  }

  // Un servicio de hoy por la mañana entre la familia y el cuidador, hasta el estado pedido.
  async function servicio(
    f: Familia,
    c: Cuidador,
    hasta: 'aceptado' | 'en_curso' | 'finalizado' | 'cancelado',
  ): Promise<string> {
    const creado = await post('/servicios', f.cookie, {
      adultoMayorId: f.adultoMayorId,
      cuidadorId: c.cuidadorId,
      fecha: HOY,
      jornada: 'manana',
      horas: 2,
      medioDePago: 'pasarela',
    }).set('Idempotency-Key', clave());
    const id = (creado.body as { servicio: { id: string } }).servicio.id;
    const cookieC = await c.cookie();
    await post(`/servicios/${id}/aceptar`, cookieC);
    if (hasta === 'cancelado')
      await post(`/servicios/${id}/cancelar`, f.cookie);
    if (hasta === 'en_curso' || hasta === 'finalizado') {
      await post(`/servicios/${id}/iniciar`, cookieC);
    }
    if (hasta === 'finalizado')
      await post(`/servicios/${id}/finalizar`, cookieC);
    return id;
  }

  async function conMedicamento(f: Familia, cuerpo: object = MEDICAMENTO) {
    const respuesta = await post(
      `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
      f.cookie,
      cuerpo,
    );
    expect(respuesta.status).toBe(201);
    return (respuesta.body as { medicamento: { id: string } }).medicamento.id;
  }

  type Dia = {
    fecha: string;
    medicamentos: {
      id: string;
      tomas: { id: string; horaProgramada: string; estado: string }[];
    }[];
  };
  async function tomasDe(f: Familia, cookie = f.cookie) {
    const respuesta = await get(
      `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
      cookie,
    );
    return (respuesta.body as Dia).medicamentos.flatMap((m) =>
      m.tomas.map((t) => ({ ...t, medicamentoId: m.id })),
    );
  }

  const auditoriaDe = (recursoId: string, accion: string, resultado: string) =>
    filas(
      `select 1 from compartido.auditoria where recurso_id = $1 and accion = $2 and resultado = $3`,
      [recursoId, accion, resultado],
    );

  // ─── E6: la matriz de acceso ───────────────────────────────────────────────────────────────
  describe('matriz de acceso (E6)', () => {
    const rutasDeLectura = (f: Familia) => [
      `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
      `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
      `/adultos-mayores/${f.adultoMayorId}/signos-vitales/ultima`,
      `/adultos-mayores/${f.adultoMayorId}/resumen`,
    ];

    it('el familiar vinculado, con consentimiento, lee todo', async () => {
      for (const ruta of rutasDeLectura(familia)) {
        expect((await get(ruta, familia.cookie)).status).toBe(200);
      }
    });

    it('sin consentimiento vigente no lee ningún dato de salud (404)', async () => {
      const sinConsentir = await nuevaFamilia(app, false);

      for (const ruta of rutasDeLectura(sinConsentir)) {
        expect((await get(ruta, sinConsentir.cookie)).status).toBe(404);
      }
      expect(
        (
          await post(
            `/adultos-mayores/${sinConsentir.adultoMayorId}/signos-vitales`,
            sinConsentir.cookie,
            { glucosa: 90 },
          )
        ).status,
      ).toBe(404);
    });

    it('revocar el consentimiento corta el acceso de inmediato', async () => {
      const f = await nuevaFamilia(app);
      const ruta = `/adultos-mayores/${f.adultoMayorId}/medicamentos`;
      expect((await get(ruta, f.cookie)).status).toBe(200);
      const [consentimiento] = await filas<{ id: string }>(
        'select id from identidad.consentimientos where adulto_mayor_id = $1',
        [f.adultoMayorId],
      );

      const revocado = await como(app)
        .delete(`/api/v1/consentimientos/${consentimiento!.id}`)
        .set('Cookie', f.cookie);

      expect(revocado.status).toBeLessThan(300);
      expect((await get(ruta, f.cookie)).status).toBe(404);
    });

    it('pedir ayuda no depende del consentimiento: una alerta sale aunque se haya revocado', async () => {
      const sinConsentir = await nuevaFamilia(app, false);

      const respuesta = await post(
        `/adultos-mayores/${sinConsentir.adultoMayorId}/alertas`,
        sinConsentir.cookie,
        { origen: 'boton' },
      ).set('Idempotency-Key', clave());

      expect(respuesta.status).toBe(201);
    });

    it('una familia ajena recibe 404 en todo, igual que con una persona que no existe', async () => {
      const ajena = await nuevaFamilia(app);
      const inexistente = nuevoId();

      for (const ruta of rutasDeLectura(familia)) {
        const ajeno = await get(ruta, ajena.cookie);
        const igual = await get(
          ruta.replace(familia.adultoMayorId, inexistente),
          ajena.cookie,
        );
        expect(ajeno.status).toBe(404);
        expect(igual.status).toBe(404);
        expect({ ...(ajeno.body as object), idDeCorrelacion: 0 }).toEqual({
          ...(igual.body as object),
          idDeCorrelacion: 0,
        });
      }
      for (const [metodo, ruta, cuerpo] of [
        [
          'post',
          `/adultos-mayores/${familia.adultoMayorId}/medicamentos`,
          MEDICAMENTO,
        ],
        [
          'post',
          `/adultos-mayores/${familia.adultoMayorId}/signos-vitales`,
          { glucosa: 90 },
        ],
        [
          'put',
          `/adultos-mayores/${familia.adultoMayorId}/rangos-de-referencia`,
          { glucosaMax: 200 },
        ],
      ] as const) {
        const r =
          metodo === 'post'
            ? await post(ruta, ajena.cookie, cuerpo)
            : await put(ruta, ajena.cookie, cuerpo);
        expect(r.status).toBe(404);
      }
      expect(
        (
          await post(
            `/adultos-mayores/${familia.adultoMayorId}/alertas`,
            ajena.cookie,
            { origen: 'boton' },
          ).set('Idempotency-Key', clave())
        ).status,
      ).toBe(404);
    });

    it('cada intento queda en la auditoría, el permitido y el denegado', async () => {
      const ajena = await nuevaFamilia(app);
      await get(
        `/adultos-mayores/${familia.adultoMayorId}/medicamentos`,
        ajena.cookie,
      );
      await get(
        `/adultos-mayores/${familia.adultoMayorId}/medicamentos`,
        familia.cookie,
      );

      expect(
        await auditoriaDe(
          familia.adultoMayorId,
          'teleasistencia.leer_medicamentos',
          'denegado',
        ),
      ).not.toHaveLength(0);
      expect(
        await auditoriaDe(
          familia.adultoMayorId,
          'teleasistencia.leer_medicamentos',
          'permitido',
        ),
      ).not.toHaveLength(0);
    });

    describe('el cuidador solo mientras tiene un servicio activo', () => {
      it('sin ningún servicio: 404', async () => {
        const c = await nuevoCuidador(app, reloj);

        for (const ruta of rutasDeLectura(familia)) {
          expect((await get(ruta, await c.cookie())).status).toBe(404);
        }
      });

      it('con un servicio solo solicitado (sin aceptar): 404', async () => {
        const f = await nuevaFamilia(app);
        const c = await nuevoCuidador(app, reloj);
        await post('/servicios', f.cookie, {
          adultoMayorId: f.adultoMayorId,
          cuidadorId: c.cuidadorId,
          fecha: HOY,
          jornada: 'manana',
          horas: 1,
          medioDePago: 'pasarela',
        }).set('Idempotency-Key', clave());

        expect(
          (
            await get(
              `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
              await c.cookie(),
            )
          ).status,
        ).toBe(404);
      });

      it.each(['aceptado', 'en_curso'] as const)(
        'con un servicio %s dentro de su franja: lee y registra',
        async (estado) => {
          const f = await nuevaFamilia(app);
          const c = await nuevoCuidador(app, reloj);
          await servicio(f, c, estado);
          const cookie = await c.cookie();

          expect(
            (
              await get(
                `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
                cookie,
              )
            ).status,
          ).toBe(200);
          expect(
            (await get(`/adultos-mayores/${f.adultoMayorId}/resumen`, cookie))
              .status,
          ).toBe(200);
          expect(
            (
              await post(
                `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
                cookie,
                { glucosa: 95 },
              )
            ).status,
          ).toBe(201);
        },
      );

      it.each(['finalizado', 'cancelado'] as const)(
        'cuando el servicio queda %s, el acceso se corta de inmediato',
        async (estado) => {
          const f = await nuevaFamilia(app);
          const c = await nuevoCuidador(app, reloj);
          const ruta = `/adultos-mayores/${f.adultoMayorId}/medicamentos`;
          const id = await servicio(f, c, 'aceptado');
          expect((await get(ruta, await c.cookie())).status).toBe(200);

          if (estado === 'finalizado') {
            await post(`/servicios/${id}/iniciar`, await c.cookie());
            await post(`/servicios/${id}/finalizar`, await c.cookie());
          } else {
            await post(`/servicios/${id}/cancelar`, f.cookie);
          }

          expect((await get(ruta, await c.cookie())).status).toBe(404);
        },
      );

      it('un servicio de OTRA persona no da acceso a esta', async () => {
        const otra = await nuevaFamilia(app);
        const c = await nuevoCuidador(app, reloj);
        await servicio(otra, c, 'en_curso');

        expect(
          (
            await get(
              `/adultos-mayores/${familia.adultoMayorId}/medicamentos`,
              await c.cookie(),
            )
          ).status,
        ).toBe(404);
      });

      it('un servicio aceptado fuera de su franja (mañana, no hoy) no da acceso todavía', async () => {
        const f = await nuevaFamilia(app);
        const c = await nuevoCuidador(app, reloj);
        const creado = await post('/servicios', f.cookie, {
          adultoMayorId: f.adultoMayorId,
          cuidadorId: c.cuidadorId,
          fecha: '2030-06-12',
          jornada: 'manana',
          horas: 1,
          medioDePago: 'pasarela',
        }).set('Idempotency-Key', clave());
        await post(
          `/servicios/${(creado.body as { servicio: { id: string } }).servicio.id}/aceptar`,
          await c.cookie(),
        );

        expect(
          (
            await get(
              `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
              await c.cookie(),
            )
          ).status,
        ).toBe(404);
      });

      it('aun con servicio activo, el cuidador no cambia el plan: no agrega, desactiva ni fija rangos', async () => {
        const f = await nuevaFamilia(app);
        const c = await nuevoCuidador(app, reloj);
        await servicio(f, c, 'en_curso');
        const medicamento = await conMedicamento(f);
        const cookie = await c.cookie();

        expect(
          (
            await post(
              `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
              cookie,
              MEDICAMENTO,
            )
          ).status,
        ).toBe(403);
        expect(
          (await post(`/medicamentos/${medicamento}/desactivar`, cookie))
            .status,
        ).toBe(403);
        expect(
          (
            await put(
              `/adultos-mayores/${f.adultoMayorId}/rangos-de-referencia`,
              cookie,
              { glucosaMax: 200 },
            )
          ).status,
        ).toBe(403);
      });
    });

    it('sin sesión, 401 en todas las rutas', async () => {
      const id = familia.adultoMayorId;
      const sinSesion = como(app);

      for (const respuesta of await Promise.all([
        como(app).get(`/api/v1/adultos-mayores/${id}/resumen`),
        como(app).get(`/api/v1/adultos-mayores/${id}/medicamentos`),
        como(app).post(`/api/v1/adultos-mayores/${id}/signos-vitales`).send({}),
        como(app).post(`/api/v1/adultos-mayores/${id}/alertas`).send({}),
        como(app).patch(`/api/v1/alertas/${nuevoId()}/atendida`).send({}),
        como(app)
          .patch(`/api/v1/medicamentos/${nuevoId()}/tomas/${nuevoId()}`)
          .send({}),
      ])) {
        expect(respuesta.status).toBe(401);
      }
      void sinSesion;
    });

    it('un administrador no usa estas rutas (403)', async () => {
      const correo = `${nuevoId()}@admin.seniory.invalid`;
      await app.get(CrearAdministrador, { strict: false }).ejecutar({
        nombre: 'Laura Administradora',
        correo,
        contrasena: CONTRASENA,
      });
      const login = await como(app)
        .post('/api/v1/auth/login')
        .send({ correo, contrasena: CONTRASENA });
      const cookie = conSesion(sesionDe(login));

      expect(
        (await get(`/adultos-mayores/${familia.adultoMayorId}/resumen`, cookie))
          .status,
      ).toBe(403);
    });

    it('un identificador que no es UUID es 400', async () => {
      expect(
        (await get('/adultos-mayores/no-es-uuid/resumen', familia.cookie))
          .status,
      ).toBe(400);
    });
  });

  // ─── Medicamentos y tomas ──────────────────────────────────────────────────────────────────
  describe('medicamentos y tomas', () => {
    it('la familia agrega un medicamento y ya aparecen las tomas de hoy', async () => {
      const f = await nuevaFamilia(app);

      const respuesta = await post(
        `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
        f.cookie,
        MEDICAMENTO,
      );

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        medicamento: {
          id: expect.any(String) as string,
          nombre: 'Losartán',
          dosis: '50 mg',
          indicaciones: 'Con el desayuno',
          horarios: ['08:00', '20:00'],
          diasDeLaSemana: [1, 2, 3, 4, 5, 6, 7],
          vigenteDesde: HOY,
          vigenteHasta: null,
        },
      });
      const dia = await get(
        `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
        f.cookie,
      );
      expect((dia.body as Dia).fecha).toBe(HOY);
      expect(
        (dia.body as Dia).medicamentos[0]?.tomas.map((t) => [
          t.horaProgramada,
          t.estado,
        ]),
      ).toEqual([
        ['08:00', 'pendiente'],
        ['20:00', 'pendiente'],
      ]);
    });

    it('consultar varias veces no duplica las tomas', async () => {
      const f = await nuevaFamilia(app);
      await conMedicamento(f);

      await Promise.all(
        Array.from({ length: 5 }, () =>
          get(`/adultos-mayores/${f.adultoMayorId}/medicamentos`, f.cookie),
        ),
      );

      expect(await tomasDe(f)).toHaveLength(2);
    });

    it('un medicamento que hoy no toca no tiene tomas hoy', async () => {
      const f = await nuevaFamilia(app);
      // Hoy es lunes.
      await conMedicamento(f, { ...MEDICAMENTO, diasDeLaSemana: [2, 4] });

      expect(await tomasDe(f)).toEqual([]);
    });

    it.each([
      ['sin horarios', { horarios: [] }],
      ['un horario inventado', { horarios: ['25:00'] }],
      ['horarios repetidos', { horarios: ['08:00', '08:00'] }],
      ['un día fuera de 1 a 7', { diasDeLaSemana: [8] }],
      ['un nombre vacío', { nombre: '' }],
      ['un campo extra (quién lo crea)', { creadoPor: nuevoId() }],
      ['un campo extra (activo)', { activo: false }],
      [
        'terminar antes de empezar',
        { vigenteDesde: '2030-06-10', vigenteHasta: '2030-06-01' },
      ],
      ['una fecha mal escrita', { vigenteDesde: '10/06/2030' }],
    ])('rechaza %s con 400', async (_nombre, cambios) => {
      const f = await nuevaFamilia(app);

      const respuesta = await post(
        `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
        f.cookie,
        {
          ...MEDICAMENTO,
          ...cambios,
        },
      );

      expect(respuesta.status).toBe(400);
    });

    describe('marcar y deshacer una toma', () => {
      async function unaToma() {
        const f = await nuevaFamilia(app);
        const medicamentoId = await conMedicamento(f);
        const [toma] = await tomasDe(f);
        return { f, medicamentoId, tomaId: toma!.id };
      }

      it('marcarla la deja tomada, y sobrevive a recargar', async () => {
        const { f, medicamentoId, tomaId } = await unaToma();

        const respuesta = await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'tomada' },
        );

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toMatchObject({
          toma: { id: tomaId, estado: 'tomada', registradaEn: INICIO },
        });
        expect((await tomasDe(f)).find((t) => t.id === tomaId)?.estado).toBe(
          'tomada',
        );
      });

      it('marcarla dos veces es 409', async () => {
        const { f, medicamentoId, tomaId } = await unaToma();
        await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'tomada' },
        );

        const otra = await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'tomada' },
        );

        expect(otra.status).toBe(409);
        expect(otra.body).toMatchObject({ codigo: 'toma.ya_tomada' });
      });

      it('deshacerla la deja pendiente y queda en la auditoría', async () => {
        const { f, medicamentoId, tomaId } = await unaToma();
        await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'tomada' },
        );

        const respuesta = await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'pendiente' },
        );

        expect(respuesta.body).toMatchObject({
          toma: { estado: 'pendiente', registradaEn: null },
        });
        expect(
          await auditoriaDe(
            tomaId,
            'teleasistencia.desmarcar_toma_hecha',
            'permitido',
          ),
        ).toHaveLength(1);
        expect(
          await auditoriaDe(
            tomaId,
            'teleasistencia.marcar_toma_hecha',
            'permitido',
          ),
        ).toHaveLength(1);
      });

      it('solo se deshace una toma que está tomada', async () => {
        const { f, medicamentoId, tomaId } = await unaToma();

        const respuesta = await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'pendiente' },
        );

        expect(respuesta.status).toBe(409);
        expect(respuesta.body).toMatchObject({ codigo: 'toma.no_esta_tomada' });
      });

      it('solo el día que corresponde: la toma de ayer no se marca (H6)', async () => {
        const { f, medicamentoId, tomaId } = await unaToma();
        await bd.query(
          `update teleasistencia.tomas set fecha = '2030-06-09' where id = $1`,
          [tomaId],
        );

        const respuesta = await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'tomada' },
        );

        expect(respuesta.status).toBe(422);
        expect(respuesta.body).toMatchObject({ codigo: 'toma.fuera_de_dia' });
      });

      it('la toma de las 11:30 p. m. se marca ese día, y pasada la medianoche ya no', async () => {
        const f = await nuevaFamilia(app);
        const medicamentoId = await conMedicamento(f, {
          ...MEDICAMENTO,
          horarios: ['23:30'],
        });
        const [toma] = await tomasDe(f);

        // 11:30 p. m. del 10 en Bogotá son las 04:30Z del 11: en UTC ya es otro día.
        reloj.fijar('2030-06-11T04:30:00.000Z');
        const cookieNoche = conSesion(
          await iniciarSesion(como(app), f.persona.correo),
        );
        const aTiempo = await patch(
          `/medicamentos/${medicamentoId}/tomas/${toma!.id}`,
          cookieNoche,
          { estado: 'tomada' },
        );
        await patch(
          `/medicamentos/${medicamentoId}/tomas/${toma!.id}`,
          cookieNoche,
          { estado: 'pendiente' },
        );
        reloj.fijar('2030-06-11T05:30:00.000Z'); // 00:30 del 11 en Bogotá
        const cookieMadrugada = conSesion(
          await iniciarSesion(como(app), f.persona.correo),
        );
        const tarde = await patch(
          `/medicamentos/${medicamentoId}/tomas/${toma!.id}`,
          cookieMadrugada,
          { estado: 'tomada' },
        );

        expect(aTiempo.status).toBe(200);
        expect(tarde.status).toBe(422);
        expect(tarde.body).toMatchObject({ codigo: 'toma.fuera_de_dia' });
      });

      it('el cuidador con servicio activo también marca la toma', async () => {
        const { f, medicamentoId, tomaId } = await unaToma();
        const c = await nuevoCuidador(app, reloj);
        await servicio(f, c, 'en_curso');

        const respuesta = await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          await c.cookie(),
          { estado: 'tomada' },
        );

        expect(respuesta.status).toBe(200);
        const [fila] = await filas<{ registrada_por: string }>(
          'select registrada_por from teleasistencia.tomas where id = $1',
          [tomaId],
        );
        expect(fila?.registrada_por).toBe(c.usuarioId);
      });

      it('una toma de otro medicamento en la ruta es 404', async () => {
        const { f, tomaId } = await unaToma();
        const otroMedicamento = await conMedicamento(f, {
          ...MEDICAMENTO,
          nombre: 'Metformina',
        });

        const respuesta = await patch(
          `/medicamentos/${otroMedicamento}/tomas/${tomaId}`,
          f.cookie,
          { estado: 'tomada' },
        );

        expect(respuesta.status).toBe(404);
      });

      it('una familia ajena no puede marcar ni deshacer: 404', async () => {
        const { medicamentoId, tomaId } = await unaToma();
        const ajena = await nuevaFamilia(app);

        const respuesta = await patch(
          `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
          ajena.cookie,
          { estado: 'tomada' },
        );

        expect(respuesta.status).toBe(404);
        const [fila] = await filas<{ estado: string }>(
          'select estado from teleasistencia.tomas where id = $1',
          [tomaId],
        );
        expect(fila?.estado).toBe('pendiente');
      });

      it.each([
        ['un estado inventado', { estado: 'omitida' }],
        ['sin estado', {}],
        ['un campo extra', { estado: 'tomada', registradaPor: nuevoId() }],
      ])('rechaza %s con 400', async (_nombre, cuerpo) => {
        const { f, medicamentoId, tomaId } = await unaToma();

        expect(
          (
            await patch(
              `/medicamentos/${medicamentoId}/tomas/${tomaId}`,
              f.cookie,
              cuerpo,
            )
          ).status,
        ).toBe(400);
      });

      it('dos pantallas marcando a la vez: una gana y la otra recibe 409', async () => {
        const { f, medicamentoId, tomaId } = await unaToma();

        const respuestas = await Promise.all(
          Array.from({ length: 4 }, () =>
            patch(`/medicamentos/${medicamentoId}/tomas/${tomaId}`, f.cookie, {
              estado: 'tomada',
            }),
          ),
        );

        expect(respuestas.filter((r) => r.status === 200)).toHaveLength(1);
        expect(respuestas.filter((r) => r.status === 409)).toHaveLength(3);
      });
    });

    it('desactivar un medicamento lo saca de la lista y de las tomas del día', async () => {
      const f = await nuevaFamilia(app);
      const id = await conMedicamento(f);

      const respuesta = await post(`/medicamentos/${id}/desactivar`, f.cookie);

      expect(respuesta.status).toBe(204);
      const dia = await get(
        `/adultos-mayores/${f.adultoMayorId}/medicamentos`,
        f.cookie,
      );
      expect((dia.body as Dia).medicamentos).toEqual([]);
    });

    it('desactivar uno de otra familia es 404', async () => {
      const id = await conMedicamento(familia);
      const ajena = await nuevaFamilia(app);

      expect(
        (await post(`/medicamentos/${id}/desactivar`, ajena.cookie)).status,
      ).toBe(404);
      expect(
        (await post(`/medicamentos/${nuevoId()}/desactivar`, ajena.cookie))
          .status,
      ).toBe(404);
    });
  });

  // ─── Tomas omitidas ────────────────────────────────────────────────────────────────────────
  describe('tomas omitidas', () => {
    // Un reloj aparte y muy anterior al de las demás pruebas: la tarea revisa TODAS las tomas vencidas de la base,
    // y con un 2030 se llevaría por delante las tomas de pruebas que corren a la vez.
    const relojDeLaTarea = new RelojFalso('2020-03-02T15:00:00.000Z'); // lunes 10:00 en Bogotá
    let appDeLaTarea: NestExpressApplication;
    let f: Familia;

    beforeAll(async () => {
      appDeLaTarea = await crearAppDePrueba({
        variables: { SECRETO_BFF },
        ajustar: (constructor) =>
          constructor.overrideProvider(RELOJ).useValue(relojDeLaTarea),
      });
      f = await nuevaFamilia(appDeLaTarea);
    });

    afterAll(async () => {
      await appDeLaTarea.close();
    });

    const omitir = () =>
      appDeLaTarea.get(OmitirTomasVencidas, { strict: false }).ejecutar();
    const tomasDeLaTarea = async () => {
      const r = await como(appDeLaTarea)
        .get(`/api/v1/adultos-mayores/${f.adultoMayorId}/medicamentos`)
        .set('Cookie', f.cookie);
      return (r.body as Dia).medicamentos.flatMap((m) => m.tomas);
    };

    it('pasada la tolerancia (60 min) la toma queda omitida, y se avisa; antes no', async () => {
      await como(appDeLaTarea)
        .post(`/api/v1/adultos-mayores/${f.adultoMayorId}/medicamentos`)
        .set('Cookie', f.cookie)
        .send({ ...MEDICAMENTO, horarios: ['09:00', '09:30', '12:00'] });

      const omitidas = await omitir();
      const estados = (await tomasDeLaTarea()).map((t) => [
        t.horaProgramada,
        t.estado,
      ]);

      // Son las 10:00: la de las 09:00 cumplió exactamente la hora de tolerancia; la de las 09:30 todavía no.
      expect(omitidas).toBe(1);
      expect(estados).toEqual([
        ['09:00', 'omitida'],
        ['09:30', 'pendiente'],
        ['12:00', 'pendiente'],
      ]);
      await appDeLaTarea
        .get(DespachadorDeEventos, { strict: false })
        .esperarEntregas();
      const avisos = await filas<{ prioridad: string; parametros: object }>(
        `select prioridad, parametros from notificaciones.notificaciones
         where destinatario_id = $1 and tipo = 'medicamento_omitido:destinatario'`,
        [f.persona.id],
      );
      expect(avisos).toEqual([{ prioridad: 'normal', parametros: {} }]);
    });

    it('correr la tarea otra vez no vuelve a omitir ni a avisar', async () => {
      const g = await nuevaFamilia(appDeLaTarea);
      await como(appDeLaTarea)
        .post(`/api/v1/adultos-mayores/${g.adultoMayorId}/medicamentos`)
        .set('Cookie', g.cookie)
        .send({ ...MEDICAMENTO, horarios: ['08:00'] });

      await omitir();
      const segunda = await omitir();
      await appDeLaTarea
        .get(DespachadorDeEventos, { strict: false })
        .esperarEntregas();

      expect(segunda).toBe(0);
      const avisos = await filas(
        `select 1 from notificaciones.notificaciones where destinatario_id = $1 and tipo = 'medicamento_omitido:destinatario'`,
        [g.persona.id],
      );
      expect(avisos).toHaveLength(1);
    });

    it('una toma que se registró a tiempo no se omite', async () => {
      const g = await nuevaFamilia(appDeLaTarea);
      const creado = await como(appDeLaTarea)
        .post(`/api/v1/adultos-mayores/${g.adultoMayorId}/medicamentos`)
        .set('Cookie', g.cookie)
        .send({ ...MEDICAMENTO, horarios: ['08:00'] });
      const medicamentoId = (creado.body as { medicamento: { id: string } })
        .medicamento.id;
      const dia = await como(appDeLaTarea)
        .get(`/api/v1/adultos-mayores/${g.adultoMayorId}/medicamentos`)
        .set('Cookie', g.cookie);
      const tomaId = (dia.body as Dia).medicamentos[0]!.tomas[0]!.id;
      await como(appDeLaTarea)
        .patch(`/api/v1/medicamentos/${medicamentoId}/tomas/${tomaId}`)
        .set('Cookie', g.cookie)
        .send({ estado: 'tomada' });

      await omitir();

      const [fila] = await filas<{ estado: string }>(
        'select estado from teleasistencia.tomas where id = $1',
        [tomaId],
      );
      expect(fila?.estado).toBe('tomada');
    });

    it('un medicamento que ya se dejó de tomar no genera omisiones', async () => {
      const g = await nuevaFamilia(appDeLaTarea);
      const creado = await como(appDeLaTarea)
        .post(`/api/v1/adultos-mayores/${g.adultoMayorId}/medicamentos`)
        .set('Cookie', g.cookie)
        .send({ ...MEDICAMENTO, horarios: ['08:00'] });
      await como(appDeLaTarea)
        .post(
          `/api/v1/medicamentos/${(creado.body as { medicamento: { id: string } }).medicamento.id}/desactivar`,
        )
        .set('Cookie', g.cookie);

      await omitir();

      const omitidas = await filas(
        `select 1 from teleasistencia.tomas where adulto_mayor_id = $1 and estado = 'omitida'`,
        [g.adultoMayorId],
      );
      expect(omitidas).toEqual([]);
    });

    it('una omitida que sí se tomó, tarde pero el mismo día, se puede registrar', async () => {
      const g = await nuevaFamilia(appDeLaTarea);
      const creado = await como(appDeLaTarea)
        .post(`/api/v1/adultos-mayores/${g.adultoMayorId}/medicamentos`)
        .set('Cookie', g.cookie)
        .send({ ...MEDICAMENTO, horarios: ['08:00'] });
      const medicamentoId = (creado.body as { medicamento: { id: string } })
        .medicamento.id;
      await omitir();
      const dia = await como(appDeLaTarea)
        .get(`/api/v1/adultos-mayores/${g.adultoMayorId}/medicamentos`)
        .set('Cookie', g.cookie);
      const toma = (dia.body as Dia).medicamentos[0]!.tomas[0]!;

      const respuesta = await como(appDeLaTarea)
        .patch(`/api/v1/medicamentos/${medicamentoId}/tomas/${toma.id}`)
        .set('Cookie', g.cookie)
        .send({ estado: 'tomada' });

      expect(toma.estado).toBe('omitida');
      expect(respuesta.status).toBe(200);
    });
  });

  // ─── Signos vitales ────────────────────────────────────────────────────────────────────────
  describe('signos vitales', () => {
    const base = {
      presionSistolica: 120,
      presionDiastolica: 80,
      frecuenciaCardiaca: 72,
      glucosa: 95,
    };

    it('registra una lectura y la devuelve', async () => {
      const f = await nuevaFamilia(app);

      const respuesta = await post(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
        f.cookie,
        base,
      );

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        lectura: {
          id: expect.any(String) as string,
          tomadaEn: INICIO,
          ...base,
          fueraDeRango: false,
          fuente: 'manual',
        },
      });
    });

    it('sin lecturas: la lista va vacía y la última es null, no un error (H8)', async () => {
      const f = await nuevaFamilia(app);

      expect(
        (
          await get(
            `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
            f.cookie,
          )
        ).body,
      ).toEqual({ lecturas: [] });
      expect(
        (
          await get(
            `/adultos-mayores/${f.adultoMayorId}/signos-vitales/ultima`,
            f.cookie,
          )
        ).body,
      ).toEqual({ lectura: null });
    });

    it('lista de los últimos 7 días por defecto, las más recientes primero, y acepta ?dias=', async () => {
      const f = await nuevaFamilia(app);
      const hace = (dias: number) =>
        new Date(Date.parse(INICIO) - dias * 86_400_000).toISOString();
      for (const dias of [10, 3, 1]) {
        await post(
          `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
          f.cookie,
          { glucosa: 90 + dias, tomadaEn: hace(dias) },
        );
      }

      const por7 = await get(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
        f.cookie,
      );
      const por2 = await get(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales?dias=2`,
        f.cookie,
      );
      const por30 = await get(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales?dias=30`,
        f.cookie,
      );
      const ultima = await get(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales/ultima`,
        f.cookie,
      );

      const glucosas = (r: { body: unknown }) =>
        (r.body as { lecturas: { glucosa: number }[] }).lecturas.map(
          (l) => l.glucosa,
        );
      expect(glucosas(por7)).toEqual([91, 93]);
      expect(glucosas(por2)).toEqual([91]);
      expect(glucosas(por30)).toEqual([91, 93, 100]);
      expect(ultima.body).toMatchObject({ lectura: { glucosa: 91 } });
    });

    it.each(['0', '31', '-1', 'muchos', '1.5'])(
      '?dias=%s es 400',
      async (dias) => {
        expect(
          (
            await get(
              `/adultos-mayores/${familia.adultoMayorId}/signos-vitales?dias=${dias}`,
              familia.cookie,
            )
          ).status,
        ).toBe(400);
      },
    );

    describe('validación', () => {
      it.each([
        ['sin medidas', {}],
        ['la presión sin diastólica', { presionSistolica: 120 }],
        ['la presión sin sistólica', { presionDiastolica: 80 }],
        [
          'diastólica mayor que sistólica',
          { presionSistolica: 100, presionDiastolica: 120 },
        ],
        ['un valor implausible', { glucosa: 9000 }],
        ['un valor con decimales', { glucosa: 95.5 }],
        ['un valor en texto', { glucosa: '95' }],
        [
          'una lectura del futuro',
          { glucosa: 90, tomadaEn: '2030-06-11T00:00:00.000Z' },
        ],
        [
          'una lectura de hace 60 días',
          { glucosa: 90, tomadaEn: '2030-04-01T00:00:00.000Z' },
        ],
        ['una fecha inválida', { glucosa: 90, tomadaEn: 'ayer' }],
        ['una fuente inventada', { glucosa: 90, fuente: 'telepatía' }],
        [
          'un campo extra (quién la registró)',
          { glucosa: 90, registradaPor: nuevoId() },
        ],
        [
          'un campo extra (fuera de rango)',
          { glucosa: 90, fueraDeRango: false },
        ],
      ])('rechaza %s con 400', async (_nombre, cuerpo) => {
        const f = await nuevaFamilia(app);

        expect(
          (
            await post(
              `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
              f.cookie,
              cuerpo,
            )
          ).status,
        ).toBe(400);
      });
    });

    describe('fuera de rango', () => {
      it('marca la lectura, anuncia SIN datos clínicos y avisa con prioridad alta', async () => {
        const f = await nuevaFamilia(app);

        const respuesta = await post(
          `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
          f.cookie,
          {
            presionSistolica: 190,
            presionDiastolica: 110,
          },
        );
        await procesarEventos();

        expect(respuesta.body).toMatchObject({
          lectura: { fueraDeRango: true },
        });
        const lecturaId = (respuesta.body as { lectura: { id: string } })
          .lectura.id;
        const [evento] = await filas<{ datos: object }>(
          `select datos from compartido.outbox where tipo = 'teleasistencia.lectura_fuera_de_rango' and datos->>'lecturaId' = $1`,
          [lecturaId],
        );
        // Solo IDs: ni la medida, ni el valor.
        expect(Object.keys(evento!.datos).sort()).toEqual([
          'adultoMayorId',
          'lecturaId',
        ]);
        const avisos = await filas<{ prioridad: string; parametros: object }>(
          `select prioridad, parametros from notificaciones.notificaciones
           where destinatario_id = $1 and tipo = 'lectura_fuera_de_rango:destinatario'`,
          [f.persona.id],
        );
        expect(avisos).toEqual([{ prioridad: 'alta', parametros: {} }]);
      });

      it('una lectura normal no anuncia nada', async () => {
        const f = await nuevaFamilia(app);

        await post(
          `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
          f.cookie,
          base,
        );
        await procesarEventos();

        expect(
          await filas(
            `select 1 from notificaciones.notificaciones where destinatario_id = $1 and tipo like 'lectura_%'`,
            [f.persona.id],
          ),
        ).toEqual([]);
      });

      it('usa los rangos de la persona cuando los tiene', async () => {
        const f = await nuevaFamilia(app);
        const medida = { presionSistolica: 150, presionDiastolica: 95 };
        const general = await post(
          `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
          f.cookie,
          medida,
        );

        const fijados = await put(
          `/adultos-mayores/${f.adultoMayorId}/rangos-de-referencia`,
          f.cookie,
          {
            sistolicaMax: 160,
            diastolicaMax: 100,
          },
        );
        const propios = await post(
          `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
          f.cookie,
          medida,
        );

        expect(fijados.status).toBe(200);
        expect(fijados.body).toMatchObject({
          rangos: { sistolicaMax: 160, diastolicaMax: 100, sistolicaMin: null },
        });
        expect(general.body).toMatchObject({ lectura: { fueraDeRango: true } });
        expect(propios.body).toMatchObject({
          lectura: { fueraDeRango: false },
        });
      });

      it.each([
        ['mínimo mayor que máximo', { glucosaMin: 200, glucosaMax: 100 }],
        ['un límite en cero', { sistolicaMax: 0 }],
        ['un límite con decimales', { sistolicaMax: 140.5 }],
        ['un campo extra', { glucosaMax: 200, definidosPor: nuevoId() }],
      ])('rechaza rangos con %s', async (_nombre, cuerpo) => {
        const f = await nuevaFamilia(app);

        expect(
          (
            await put(
              `/adultos-mayores/${f.adultoMayorId}/rangos-de-referencia`,
              f.cookie,
              cuerpo,
            )
          ).status,
        ).toBe(400);
      });
    });
  });

  // ─── Alertas (E11) ─────────────────────────────────────────────────────────────────────────
  describe('alertas', () => {
    const pedir = (
      f: Familia,
      cookie = f.cookie,
      k = clave(),
      origen = 'boton',
    ) =>
      post(`/adultos-mayores/${f.adultoMayorId}/alertas`, cookie, {
        origen,
      }).set('Idempotency-Key', k);

    it('crea la alerta y dice a quién se avisó', async () => {
      const f = await nuevaFamilia(app);

      const respuesta = await pedir(f);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        alerta: {
          id: expect.any(String) as string,
          origen: 'boton',
          estado: 'generada',
          generadaEn: INICIO,
          primeraEntregaEn: null,
          atendidaEn: null,
          nota: null,
          avisadosA: ['Andrea Gómez'],
        },
      });
    });

    it('avisa a la familia vinculada Y al cuidador en turno, con prioridad alta', async () => {
      const f = await nuevaFamilia(app);
      const c = await nuevoCuidador(app, reloj);
      await servicio(f, c, 'en_curso');

      const respuesta = await pedir(f);
      await procesarEventos();

      const id = (
        respuesta.body as { alerta: { id: string; avisadosA: string[] } }
      ).alerta;
      expect(id.avisadosA).toHaveLength(2);
      const [evento] = await filas<{
        datos: { destinatarios: string[]; generadaPor: string };
      }>(
        `select datos from compartido.outbox where tipo = 'teleasistencia.alerta_generada' and datos->>'alertaId' = $1`,
        [id.id],
      );
      expect([...evento!.datos.destinatarios].sort()).toEqual(
        [f.persona.id, c.usuarioId].sort(),
      );
      const avisos = await filas<{
        destinatario_id: string;
        prioridad: string;
        canal: string;
      }>(
        `select destinatario_id, prioridad, canal from notificaciones.notificaciones where parametros->>'alertaId' = $1`,
        [id.id],
      );
      expect(avisos.map((a) => a.destinatario_id).sort()).toEqual(
        [f.persona.id, c.usuarioId].sort(),
      );
      expect(avisos.every((a) => a.prioridad === 'alta')).toBe(true);
    });

    it('el aviso dice de quién es la alerta y recuerda el 123', async () => {
      const f = await nuevaFamilia(app);
      await pedir(f);
      await procesarEventos();
      await entregarTodo();

      const campana = await get('/notificaciones', f.cookie);

      expect(campana.body).toMatchObject({
        notificaciones: [
          {
            tipo: 'alerta_generada:destinatario',
            titulo: 'Alerta de Carmen Gómez',
            prioridad: 'alta',
            cuerpo: expect.stringContaining('llama al 123') as string,
          },
        ],
      });
    });

    it('al entregarse el primer aviso, la alerta pasa a «notificada» y queda cuándo salió (E11)', async () => {
      const f = await nuevaFamilia(app);
      const creada = await pedir(f);
      const alertaId = (creada.body as { alerta: { id: string } }).alerta.id;
      await procesarEventos();
      await entregarTodo();
      await procesarEventos();

      const [fila] = await filas<{
        estado: string;
        generada_en: Date;
        primera_entrega_en: Date | null;
      }>(
        'select estado, generada_en, primera_entrega_en from teleasistencia.alertas where id = $1',
        [alertaId],
      );

      expect(fila?.estado).toBe('notificada');
      expect(fila?.primera_entrega_en).not.toBeNull();
      // E11: la primera entrega ocurre menos de 30 s después de generarse.
      const segundos =
        (fila!.primera_entrega_en!.getTime() - fila!.generada_en.getTime()) /
        1000;
      expect(segundos).toBeGreaterThanOrEqual(0);
      expect(segundos).toBeLessThan(30);
    });

    it('sin el encabezado Idempotency-Key es 400', async () => {
      const respuesta = await post(
        `/adultos-mayores/${familia.adultoMayorId}/alertas`,
        familia.cookie,
        { origen: 'boton' },
      );

      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toMatchObject({ codigo: 'idempotencia.falta' });
    });

    it.each([
      ['un origen del sistema', { origen: 'signos' }],
      ['un origen inventado', { origen: 'paloma' }],
      ['sin origen', {}],
      ['un campo extra', { origen: 'boton', destinatarios: [nuevoId()] }],
    ])('rechaza %s con 400', async (_nombre, cuerpo) => {
      const respuesta = await post(
        `/adultos-mayores/${familia.adultoMayorId}/alertas`,
        familia.cookie,
        cuerpo,
      ).set('Idempotency-Key', clave());

      expect(respuesta.status).toBe(400);
    });

    it('un reintento con la misma clave devuelve la misma alerta (201 y luego 200) y no avisa dos veces', async () => {
      const f = await nuevaFamilia(app);
      const k = clave();

      const primera = await pedir(f, f.cookie, k);
      const segunda = await pedir(f, f.cookie, k);
      await procesarEventos();

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(200);
      expect((segunda.body as { alerta: { id: string } }).alerta.id).toBe(
        (primera.body as { alerta: { id: string } }).alerta.id,
      );
      expect(
        await filas(
          'select 1 from teleasistencia.alertas where adulto_mayor_id = $1',
          [f.adultoMayorId],
        ),
      ).toHaveLength(1);
      expect(
        await filas(
          `select 1 from notificaciones.notificaciones where parametros->>'alertaId' = $1`,
          [(primera.body as { alerta: { id: string } }).alerta.id],
        ),
      ).toHaveLength(1);
    });

    it('cinco reintentos SIMULTÁNEOS crean una sola alerta', async () => {
      const f = await nuevaFamilia(app);
      const k = clave();

      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () => pedir(f, f.cookie, k)),
      );

      const ids = new Set(
        respuestas.map((r) => (r.body as { alerta: { id: string } }).alerta.id),
      );
      expect(respuestas.every((r) => [200, 201].includes(r.status))).toBe(true);
      expect(ids.size).toBe(1);
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        await filas(
          'select 1 from teleasistencia.alertas where adulto_mayor_id = $1',
          [f.adultoMayorId],
        ),
      ).toHaveLength(1);
    });

    it('la misma clave con otro origen es 409', async () => {
      const f = await nuevaFamilia(app);
      const k = clave();
      await pedir(f, f.cookie, k, 'boton');

      const otra = await pedir(f, f.cookie, k, 'voz');

      expect(otra.status).toBe(409);
      expect(otra.body).toMatchObject({ codigo: 'alerta.clave_reutilizada' });
    });

    it('el cuidador con servicio activo también puede pedir ayuda', async () => {
      const f = await nuevaFamilia(app);
      const c = await nuevoCuidador(app, reloj);
      await servicio(f, c, 'en_curso');

      expect((await pedir(f, await c.cookie())).status).toBe(201);
    });

    describe('atender', () => {
      it('la familia la atiende: queda atendida, con nota, y se anuncia', async () => {
        const f = await nuevaFamilia(app);
        const alertaId = ((await pedir(f)).body as { alerta: { id: string } })
          .alerta.id;

        const respuesta = await patch(
          `/alertas/${alertaId}/atendida`,
          f.cookie,
          { nota: '  Ya hablé con ella  ' },
        );
        await procesarEventos();

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toMatchObject({
          alerta: {
            id: alertaId,
            estado: 'atendida',
            atendidaEn: INICIO,
            nota: 'Ya hablé con ella',
          },
        });
        expect(
          await filas(
            `select 1 from compartido.outbox where tipo = 'teleasistencia.alerta_atendida' and datos->>'alertaId' = $1`,
            [alertaId],
          ),
        ).toHaveLength(1);
      });

      it('no se atiende dos veces (409)', async () => {
        const f = await nuevaFamilia(app);
        const alertaId = ((await pedir(f)).body as { alerta: { id: string } })
          .alerta.id;
        await patch(`/alertas/${alertaId}/atendida`, f.cookie);

        const otra = await patch(`/alertas/${alertaId}/atendida`, f.cookie);

        expect(otra.status).toBe(409);
        expect(otra.body).toMatchObject({ codigo: 'alerta.ya_atendida' });
      });

      it('una familia ajena no la atiende: 404 (igual que una alerta que no existe)', async () => {
        const f = await nuevaFamilia(app);
        const alertaId = ((await pedir(f)).body as { alerta: { id: string } })
          .alerta.id;
        const ajena = await nuevaFamilia(app);

        expect(
          (await patch(`/alertas/${alertaId}/atendida`, ajena.cookie)).status,
        ).toBe(404);
        expect(
          (await patch(`/alertas/${nuevoId()}/atendida`, ajena.cookie)).status,
        ).toBe(404);
        const [fila] = await filas<{ estado: string }>(
          'select estado from teleasistencia.alertas where id = $1',
          [alertaId],
        );
        expect(fila?.estado).not.toBe('atendida');
      });

      it('una nota demasiado larga es 400', async () => {
        const f = await nuevaFamilia(app);
        const alertaId = ((await pedir(f)).body as { alerta: { id: string } })
          .alerta.id;

        expect(
          (
            await patch(`/alertas/${alertaId}/atendida`, f.cookie, {
              nota: 'a'.repeat(1201),
            })
          ).status,
        ).toBe(400);
      });
    });
  });

  // ─── Resumen ───────────────────────────────────────────────────────────────────────────────
  describe('resumen', () => {
    it('una persona sin nada: ceros y nulos', async () => {
      const f = await nuevaFamilia(app);

      const respuesta = await get(
        `/adultos-mayores/${f.adultoMayorId}/resumen`,
        f.cookie,
      );

      expect(respuesta.body).toEqual({
        resumen: {
          fecha: HOY,
          tomasDeHoy: { total: 0, tomadas: 0, pendientes: 0, omitidas: 0 },
          proximaToma: null,
          ultimaLectura: null,
          alertasSinAtender: 0,
        },
      });
    });

    it('el día en una sola consulta: tomas, próxima toma, última lectura y alertas', async () => {
      const f = await nuevaFamilia(app);
      const medicamentoId = await conMedicamento(f);
      const [primera] = await tomasDe(f);
      await patch(
        `/medicamentos/${medicamentoId}/tomas/${primera!.id}`,
        f.cookie,
        { estado: 'tomada' },
      );
      await post(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
        f.cookie,
        { glucosa: 300 },
      );
      await post(`/adultos-mayores/${f.adultoMayorId}/alertas`, f.cookie, {
        origen: 'boton',
      }).set('Idempotency-Key', clave());

      const respuesta = await get(
        `/adultos-mayores/${f.adultoMayorId}/resumen`,
        f.cookie,
      );

      expect(respuesta.body).toEqual({
        resumen: {
          fecha: HOY,
          tomasDeHoy: { total: 2, tomadas: 1, pendientes: 1, omitidas: 0 },
          proximaToma: {
            medicamentoId,
            nombre: 'Losartán',
            horaProgramada: '20:00',
          },
          ultimaLectura: { tomadaEn: INICIO, fueraDeRango: true },
          alertasSinAtender: 1,
        },
      });
    });

    it('un medicamento desactivado ya no cuenta', async () => {
      const f = await nuevaFamilia(app);
      const id = await conMedicamento(f);
      await post(`/medicamentos/${id}/desactivar`, f.cookie);

      const respuesta = await get(
        `/adultos-mayores/${f.adultoMayorId}/resumen`,
        f.cookie,
      );

      expect(respuesta.body).toMatchObject({
        resumen: { tomasDeHoy: { total: 0 }, proximaToma: null },
      });
    });

    it('una alerta atendida deja de contar', async () => {
      const f = await nuevaFamilia(app);
      const alertaId = (
        (
          await post(`/adultos-mayores/${f.adultoMayorId}/alertas`, f.cookie, {
            origen: 'boton',
          }).set('Idempotency-Key', clave())
        ).body as { alerta: { id: string } }
      ).alerta.id;
      await patch(`/alertas/${alertaId}/atendida`, f.cookie);

      const respuesta = await get(
        `/adultos-mayores/${f.adultoMayorId}/resumen`,
        f.cookie,
      );

      expect(respuesta.body).toMatchObject({
        resumen: { alertasSinAtender: 0 },
      });
    });
  });

  // ─── Minimización ──────────────────────────────────────────────────────────────────────────
  describe('los datos clínicos no salen de Teleasistencia', () => {
    it('ningún evento del outbox lleva medicamentos, lecturas ni notas', async () => {
      const f = await nuevaFamilia(app);
      const medicamentoId = await conMedicamento(f, {
        ...MEDICAMENTO,
        nombre: 'Warfarina',
      });
      const [toma] = await tomasDe(f);
      await patch(
        `/medicamentos/${medicamentoId}/tomas/${toma!.id}`,
        f.cookie,
        { estado: 'tomada' },
      );
      await post(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
        f.cookie,
        { glucosa: 412 },
      );
      const alertaId = (
        (
          await post(`/adultos-mayores/${f.adultoMayorId}/alertas`, f.cookie, {
            origen: 'boton',
          }).set('Idempotency-Key', clave())
        ).body as { alerta: { id: string } }
      ).alerta.id;
      await patch(`/alertas/${alertaId}/atendida`, f.cookie, {
        nota: 'Se cayó en el baño',
      });
      await procesarEventos();

      const eventos = await filas<{ datos: object }>(
        `select datos from compartido.outbox where tipo like 'teleasistencia.%' and datos->>'adultoMayorId' = $1`,
        [f.adultoMayorId],
      );
      const texto = JSON.stringify(eventos);

      expect(eventos.length).toBeGreaterThanOrEqual(3);
      expect(texto).not.toContain('Warfarina');
      expect(texto).not.toContain('412');
      expect(texto).not.toContain('Se cayó');
      expect(texto).not.toContain('50 mg');
    });

    it('ningún aviso (campana, SMS ni correo) lleva datos de salud', async () => {
      const f = await nuevaFamilia(app);
      await conMedicamento(f, { ...MEDICAMENTO, nombre: 'Warfarina' });
      await post(
        `/adultos-mayores/${f.adultoMayorId}/signos-vitales`,
        f.cookie,
        { glucosa: 412 },
      );
      await post(`/adultos-mayores/${f.adultoMayorId}/alertas`, f.cookie, {
        origen: 'boton',
      }).set('Idempotency-Key', clave());
      await procesarEventos();
      await entregarTodo();

      const campana = JSON.stringify(
        (await get('/notificaciones', f.cookie)).body,
      );
      const avisos = JSON.stringify(
        await filas(
          'select parametros from notificaciones.notificaciones where destinatario_id = $1',
          [f.persona.id],
        ),
      );

      for (const texto of [campana, avisos]) {
        expect(texto).not.toContain('Warfarina');
        expect(texto).not.toContain('412');
        expect(texto).not.toContain('glucosa');
      }
    });
  });
});
