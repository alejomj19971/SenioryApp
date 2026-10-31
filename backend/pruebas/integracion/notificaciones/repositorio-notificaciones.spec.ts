import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import {
  CANALES,
  ESTADOS_DE_NOTIFICACION,
  PRIORIDADES,
} from '../../../src/notificaciones/dominio/valores-cerrados.js';
import { RepositorioNotificacionesDrizzle } from '../../../src/notificaciones/infraestructura/salida/persistencia/repositorio-notificaciones-drizzle.js';
import { conectarDrizzle, nuevoId } from '../../soporte/bd.js';
import { avisoDePrueba } from '../../soporte/notificaciones.js';
import { esperar } from '../../soporte/repositorios-identidad.js';

// El repositorio de notificaciones contra Postgres real. La base se comparte con las demás pruebas: cada prueba
// usa su propia persona y nunca depende de «todo lo que hay».
describe('RepositorioNotificacionesDrizzle', () => {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  const repositorio = new RepositorioNotificacionesDrizzle(contexto);

  afterAll(async () => {
    await pool.end();
  });

  const AHORA = new Date('2026-10-21T15:00:00.000Z');
  const despues = (ms: number) => new Date(AHORA.getTime() + ms);
  const persona = () => nuevoId();
  const aviso = (destinatarioId: string, cambios = {}) =>
    avisoDePrueba({ destinatarioId, ahora: AHORA, ...cambios });
  const filas = async <T extends object>(
    texto: string,
    parametros: unknown[],
  ) => (await pool.query<T>(texto, parametros)).rows;

  describe('constantes del dominio y CHECK de la base de datos', () => {
    const literales = async (restriccion: string) => {
      const { rows } = await pool.query<{ definicion: string }>(
        `select pg_get_constraintdef(c.oid) as definicion
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
         where n.nspname = 'notificaciones' and c.conname = $1`,
        [restriccion],
      );
      return [...(rows[0]?.definicion ?? '').matchAll(/'([^']+)'::text/g)]
        .map((m) => m[1] as string)
        .sort();
    };

    it.each([
      ['canales', 'notificaciones_canal_valido', CANALES],
      ['prioridades', 'notificaciones_prioridad_valida', PRIORIDADES],
      ['estados', 'notificaciones_estado_valido', ESTADOS_DE_NOTIFICACION],
    ] as const)(
      'los %s coinciden (%s)',
      async (_nombre, restriccion, constantes) => {
        expect(await literales(restriccion)).toEqual([...constantes].sort());
      },
    );
  });

  describe('crear', () => {
    it('guarda el aviso y lo devuelve igual', async () => {
      const destinatario = persona();
      const nuevo = aviso(destinatario, {
        tipo: 'servicio_confirmado:familia',
      });

      expect(await repositorio.crear([nuevo])).toBe(1);

      const leido = await repositorio.buscarPorId(nuevo.id);
      expect(leido).toMatchObject({
        id: nuevo.id,
        destinatarioId: destinatario,
        eventoId: nuevo.eventoId,
        tipo: 'servicio_confirmado:familia',
        prioridad: 'normal',
        canal: 'app',
        estado: 'pendiente',
        intentos: 0,
        proximoIntentoEn: AHORA,
        creadaEn: AHORA,
        enviadaEn: null,
        entregadaEn: null,
        ultimoError: null,
      });
      expect(leido?.parametros).toEqual(nuevo.parametros);
    });

    it('sin avisos no hace nada', async () => {
      expect(await repositorio.crear([])).toBe(0);
    });

    it('el mismo evento, destinatario, tipo y canal no se repite, y no es un error', async () => {
      const destinatario = persona();
      const primero = aviso(destinatario);
      const repetido = aviso(destinatario, {
        eventoId: primero.eventoId,
        tipo: primero.tipo,
        canal: primero.canal,
      });

      const a = await repositorio.crear([primero]);
      const b = await repositorio.crear([repetido]);

      expect([a, b]).toEqual([1, 0]);
      expect(
        await filas(
          'select 1 from notificaciones.notificaciones where destinatario_id = $1',
          [destinatario],
        ),
      ).toHaveLength(1);
    });

    it('en un mismo lote crea los nuevos y omite los repetidos', async () => {
      const destinatario = persona();
      const existente = aviso(destinatario);
      await repositorio.crear([existente]);
      const repetido = aviso(destinatario, {
        eventoId: existente.eventoId,
        tipo: existente.tipo,
        canal: existente.canal,
      });
      const otroCanal = aviso(destinatario, {
        eventoId: existente.eventoId,
        tipo: existente.tipo,
        canal: 'correo',
      });

      expect(await repositorio.crear([repetido, otroCanal])).toBe(1);
    });

    it('otro canal, otro tipo o otro destinatario del mismo evento SÍ crean su aviso', async () => {
      const destinatario = persona();
      const base = aviso(destinatario);
      const creados = await repositorio.crear([
        base,
        aviso(destinatario, {
          eventoId: base.eventoId,
          tipo: base.tipo,
          canal: 'correo',
        }),
        aviso(destinatario, {
          eventoId: base.eventoId,
          tipo: 'servicio_iniciado:familia',
        }),
        aviso(persona(), { eventoId: base.eventoId, tipo: base.tipo }),
      ]);

      expect(creados).toBe(4);
    });
  });

  describe('reclamarPendientes', () => {
    it('toma los pendientes a los que ya les toca y los reserva', async () => {
      const destinatario = persona();
      const listo = aviso(destinatario);
      await repositorio.crear([listo]);

      const tomadas = await repositorio.reclamarPendientes(
        despues(1),
        1000,
        60_000,
      );

      const mia = tomadas.find((n) => n.id === listo.id);
      expect(mia?.proximoIntentoEn).toEqual(despues(1 + 60_000));
      // La reserva queda guardada: nadie más la ve hasta que venza.
      const otraVez = await repositorio.reclamarPendientes(
        despues(2),
        1000,
        60_000,
      );
      expect(otraVez.map((n) => n.id)).not.toContain(listo.id);
      const vencida = await repositorio.reclamarPendientes(
        despues(61_002),
        1000,
        60_000,
      );
      expect(vencida.map((n) => n.id)).toContain(listo.id);
    });

    it('no toma los que todavía no les toca ni los que ya terminaron', async () => {
      const destinatario = persona();
      const futuro = aviso(destinatario, { ahora: despues(10 * 60_000) });
      const terminado = aviso(destinatario, {
        tipo: 'servicio_iniciado:familia',
      });
      await repositorio.crear([futuro, terminado]);
      terminado.marcarEntregada(AHORA);
      await repositorio.registrarIntento(terminado, {
        resultado: 'exito',
        respuesta: 'entregada',
        intentadoEn: AHORA,
      });

      const tomadas = await repositorio.reclamarPendientes(
        despues(1),
        1000,
        60_000,
      );

      const ids = tomadas.map((n) => n.id);
      expect(ids).not.toContain(futuro.id);
      expect(ids).not.toContain(terminado.id);
    });

    it('respeta el límite', async () => {
      const destinatario = persona();
      await repositorio.crear([
        aviso(destinatario, { tipo: 'servicio_iniciado:familia' }),
        aviso(destinatario, { tipo: 'servicio_finalizado:familia' }),
        aviso(destinatario, { tipo: 'servicio_confirmado:familia' }),
      ]);

      const tomadas = await repositorio.reclamarPendientes(
        despues(1),
        1,
        60_000,
      );

      expect(tomadas).toHaveLength(1);
    });

    it('dos quienes reclaman a la vez no se llevan el mismo aviso', async () => {
      const destinatario = persona();
      const avisos = Array.from({ length: 20 }, (_, i) =>
        aviso(destinatario, {
          tipo: `servicio_confirmado:familia`,
          eventoId: `0198aaaa-0000-7000-8000-${String(i).padStart(12, '0')}`,
        }),
      );
      await repositorio.crear(avisos);
      const ids = new Set(avisos.map((a) => a.id));

      const [a, b] = await Promise.all([
        contexto.ejecutar(async () => {
          const tomadas = await repositorio.reclamarPendientes(
            despues(1),
            1000,
            60_000,
          );
          await esperar(150);
          return tomadas;
        }),
        contexto.ejecutar(async () => {
          await esperar(30);
          return repositorio.reclamarPendientes(despues(1), 1000, 60_000);
        }),
      ]);

      const idsA = a.map((n) => n.id).filter((id) => ids.has(id));
      const idsB = b.map((n) => n.id).filter((id) => ids.has(id));
      expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    });
  });

  describe('registrarIntento', () => {
    it('guarda el nuevo estado del aviso y deja una fila en el historial de intentos', async () => {
      const destinatario = persona();
      const nuevo = aviso(destinatario);
      await repositorio.crear([nuevo]);
      nuevo.marcarEntregada(despues(5_000));

      await repositorio.registrarIntento(nuevo, {
        resultado: 'exito',
        respuesta: 'entregada',
        intentadoEn: despues(5_000),
      });

      const leido = await repositorio.buscarPorId(nuevo.id);
      expect(leido).toMatchObject({
        estado: 'entregada',
        intentos: 1,
        enviadaEn: despues(5_000),
        entregadaEn: despues(5_000),
      });
      const intentos = await filas<{
        resultado: string;
        respuesta_proveedor: string;
      }>(
        'select resultado, respuesta_proveedor from notificaciones.intentos_de_envio where notificacion_id = $1',
        [nuevo.id],
      );
      expect(intentos).toEqual([
        { resultado: 'exito', respuesta_proveedor: 'entregada' },
      ]);
    });

    it('un fallo guarda el error y la hora del próximo intento', async () => {
      const nuevo = aviso(persona(), { canal: 'correo' });
      await repositorio.crear([nuevo]);
      nuevo.registrarFallo(despues(1_000), 'proveedor caído');

      await repositorio.registrarIntento(nuevo, {
        resultado: 'error',
        respuesta: 'proveedor caído',
        intentadoEn: despues(1_000),
      });

      const leido = await repositorio.buscarPorId(nuevo.id);
      expect(leido).toMatchObject({
        estado: 'pendiente',
        intentos: 1,
        ultimoError: 'proveedor caído',
        proximoIntentoEn: despues(31_000),
      });
    });

    it('cada intento deja su propia fila', async () => {
      const nuevo = aviso(persona(), { canal: 'correo' });
      await repositorio.crear([nuevo]);
      nuevo.registrarFallo(despues(1_000), 'uno');
      await repositorio.registrarIntento(nuevo, {
        resultado: 'error',
        respuesta: 'uno',
        intentadoEn: despues(1_000),
      });
      nuevo.marcarEntregada(despues(40_000));
      await repositorio.registrarIntento(nuevo, {
        resultado: 'exito',
        respuesta: 'entregada',
        intentadoEn: despues(40_000),
      });

      const intentos = await filas<{ resultado: string }>(
        'select resultado from notificaciones.intentos_de_envio where notificacion_id = $1 order by intentado_en',
        [nuevo.id],
      );

      expect(intentos.map((i) => i.resultado)).toEqual(['error', 'exito']);
    });

    it('el aviso y su intento se guardan juntos o no se guarda ninguno', async () => {
      const huerfano = aviso(persona()); // nunca se creó en la base
      huerfano.marcarEntregada(AHORA);

      await repositorio
        .registrarIntento(huerfano, {
          resultado: 'exito',
          respuesta: 'entregada',
          intentadoEn: AHORA,
        })
        .catch(() => undefined);

      expect(
        await filas(
          'select 1 from notificaciones.intentos_de_envio where notificacion_id = $1',
          [huerfano.id],
        ),
      ).toEqual([]);
    });
  });

  describe('delMismoAviso y contarRecientes', () => {
    it('trae los canales de un mismo aviso y no los de otros', async () => {
      const destinatario = persona();
      const app = aviso(destinatario, { prioridad: 'alta' });
      const sms = aviso(destinatario, {
        prioridad: 'alta',
        eventoId: app.eventoId,
        tipo: app.tipo,
        canal: 'sms',
      });
      const otro = aviso(destinatario, { tipo: 'servicio_iniciado:familia' });
      await repositorio.crear([app, sms, otro]);

      const hermanas = await repositorio.delMismoAviso(app);

      expect(hermanas.map((n) => n.canal).sort()).toEqual(['app', 'sms']);
    });

    it('cuenta los avisos de una persona desde una fecha', async () => {
      const destinatario = persona();
      await repositorio.crear([
        aviso(destinatario, {
          ahora: despues(-2 * 60 * 60_000),
          tipo: 'servicio_iniciado:familia',
        }),
        aviso(destinatario, {
          ahora: despues(-30 * 60_000),
          tipo: 'servicio_finalizado:familia',
        }),
        aviso(destinatario, {
          ahora: despues(-10 * 60_000),
          tipo: 'servicio_confirmado:familia',
        }),
        aviso(persona()),
      ]);

      expect(
        await repositorio.contarRecientes(destinatario, despues(-60 * 60_000)),
      ).toBe(2);
      expect(
        await repositorio.contarRecientes(
          destinatario,
          despues(-3 * 60 * 60_000),
        ),
      ).toBe(3);
      expect(
        await repositorio.contarRecientes(persona(), despues(-3 * 60 * 60_000)),
      ).toBe(0);
    });
  });

  describe('listarDe', () => {
    async function tres(destinatario: string) {
      const avisos = [0, 1, 2].map((i) =>
        aviso(destinatario, {
          ahora: despues(i * 1000),
          eventoId: `0198aaaa-0000-7000-8000-${String(i).padStart(12, '0')}`,
        }),
      );
      await repositorio.crear(avisos);
      return avisos;
    }

    it('los de una persona por un canal, los más recientes primero', async () => {
      const destinatario = persona();
      const avisos = await tres(destinatario);
      await repositorio.crear([
        aviso(destinatario, { canal: 'correo', ahora: despues(9_000) }),
      ]);

      const pagina = await repositorio.listarDe(destinatario, 'app', 10, null);

      expect(pagina.notificaciones.map((n) => n.id)).toEqual(
        [...avisos].reverse().map((n) => n.id),
      );
      expect(pagina.siguiente).toBeNull();
    });

    it('no mezcla los de otra persona', async () => {
      await tres(persona());

      const pagina = await repositorio.listarDe(persona(), 'app', 10, null);

      expect(pagina.notificaciones).toEqual([]);
    });

    it('pagina con cursor sin repetir ni saltarse a nadie', async () => {
      const destinatario = persona();
      const avisos = await tres(destinatario);

      const vistos: string[] = [];
      let cursor = null as Awaited<
        ReturnType<typeof repositorio.listarDe>
      >['siguiente'];
      let paginas = 0;
      do {
        const pagina = await repositorio.listarDe(
          destinatario,
          'app',
          1,
          cursor,
        );
        vistos.push(...pagina.notificaciones.map((n) => n.id));
        cursor = pagina.siguiente;
        paginas += 1;
      } while (cursor !== null && paginas < 10);

      expect(vistos).toEqual([...avisos].reverse().map((n) => n.id));
      expect(paginas).toBe(3);
    });
  });
});
