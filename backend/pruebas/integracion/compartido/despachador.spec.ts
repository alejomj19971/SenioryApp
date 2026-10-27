import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ManejadorDeEventos } from '../../../src/compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { EventoDeIntegracion } from '../../../src/compartido/eventos/evento-de-integracion.js';
import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { ContextoDePeticionAls } from '../../../src/compartido/infraestructura/contexto-de-peticion-als.js';
import {
  DespachadorDeEventos,
  type OpcionesDelDespachador,
} from '../../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { PublicadorDeEventosOutbox } from '../../../src/compartido/infraestructura/outbox/publicador-de-eventos-outbox.js';
import { RegistroDeManejadores } from '../../../src/compartido/infraestructura/outbox/registro-de-manejadores.js';
import { conectarDrizzle, nuevoId } from '../../soporte/bd.js';
import { RelojFalso } from '../../soporte/dobles.js';

// M0 §6: «un evento confirmado se entrega una vez; reprocesarlo no vuelve a ejecutar el manejador;
// un manejador que falla se reintenta y termina en fallido_en».
//
// Aislamiento: la base es compartida por todas las pruebas de integración. El despachador solo
// reclama eventos con `proxima_ejecucion` <= la hora de su reloj; por eso cada prueba usa un
// RelojFalso en un año propio y lejano (las demás pruebas escriben eventos con la fecha real).

interface ManejadorDePrueba extends ManejadorDeEventos {
  llamadas: EventoDeIntegracion[];
}

function manejadorDePrueba(
  tipo: string,
  accion: (
    evento: EventoDeIntegracion,
    intento: number,
  ) => Promise<void> = () => Promise.resolve(),
): ManejadorDePrueba {
  const llamadas: EventoDeIntegracion[] = [];
  return {
    nombre: `prueba.${nuevoId()}`,
    tipo,
    llamadas,
    manejar: (evento) => {
      llamadas.push(evento);
      return accion(evento, llamadas.length);
    },
  };
}

describe('DespachadorDeEventos', () => {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  const contextoDePeticion = new ContextoDePeticionAls();

  beforeAll(() => {
    // Los reintentos y fallos se registran en el log; aquí se comprueban en la base.
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await pool.end();
  });

  function montar(
    anio: number,
    opciones: Partial<OpcionesDelDespachador> = {},
  ) {
    const reloj = new RelojFalso(`${anio}-03-01T12:00:00.000Z`);
    const registro = new RegistroDeManejadores();
    const despachador = new DespachadorDeEventos(
      bd,
      contexto,
      registro,
      reloj,
      contextoDePeticion,
      opciones,
    );
    // Publicador sin entrega inmediata: la prueba decide cuándo despachar.
    const publicador = new PublicadorDeEventosOutbox(contexto, {
      programar: () => undefined,
    } as unknown as DespachadorDeEventos);
    const tipo = `prueba.evento_${nuevoId().slice(0, 8)}`;

    const publicar = async (datos: unknown = { valor: 1 }): Promise<string> => {
      const id = nuevoId();
      await contexto.ejecutar(() =>
        publicador.publicar({
          id,
          tipo,
          version: 1,
          ocurridoEn: reloj.ahora().toISOString(),
          idDeCorrelacion: nuevoId(),
          datos,
        }),
      );
      return id;
    };

    return { reloj, registro, despachador, publicador, tipo, publicar };
  }

  async function filaDelOutbox(id: string) {
    const { rows } = await pool.query<{
      intentos: number;
      procesado_en: Date | null;
      fallido_en: Date | null;
      proxima_ejecucion: Date;
      ultimo_error: string | null;
    }>(
      `select intentos, procesado_en, fallido_en, proxima_ejecucion, ultimo_error
       from compartido.outbox where id = $1`,
      [id],
    );
    const fila = rows[0];
    if (fila === undefined) throw new Error(`No existe el evento ${id}`);
    return fila;
  }

  it('entrega un evento confirmado una sola vez, con el sobre completo', async () => {
    const { reloj, registro, despachador, tipo, publicar } = montar(2001);
    const manejador = manejadorDePrueba(tipo);
    registro.registrar(manejador);
    const id = await publicar({ servicioId: 'abc', horas: 4 });

    expect(await despachador.procesarPendientes([id])).toBe(1);
    expect(await despachador.procesarPendientes([id])).toBe(0);

    expect(manejador.llamadas).toEqual([
      expect.objectContaining({
        id,
        tipo,
        version: 1,
        ocurridoEn: reloj.ahora().toISOString(),
        datos: { servicioId: 'abc', horas: 4 },
      }),
    ]);
    expect(await filaDelOutbox(id)).toMatchObject({
      procesado_en: reloj.ahora(),
      intentos: 0,
      ultimo_error: null,
    });
  });

  it('si el evento se vuelve a entregar, el manejador no se repite (idempotencia)', async () => {
    const { registro, despachador, tipo, publicar } = montar(2002);
    const manejador = manejadorDePrueba(tipo);
    registro.registrar(manejador);
    const id = await publicar();
    await despachador.procesarPendientes([id]);

    // Simula una segunda entrega (por ejemplo, el proceso murió antes de marcarlo procesado).
    await pool.query(
      `update compartido.outbox set procesado_en = null, proxima_ejecucion = '2002-01-01' where id = $1`,
      [id],
    );
    expect(await despachador.procesarPendientes([id])).toBe(1);

    expect(manejador.llamadas).toHaveLength(1);
    expect((await filaDelOutbox(id)).procesado_en).not.toBeNull();
  });

  it('reintenta un manejador que falla, con espera creciente, hasta que funciona', async () => {
    const { reloj, registro, despachador, tipo, publicar } = montar(2003);
    const inicio = reloj.ahora().getTime();
    const manejador = manejadorDePrueba(tipo, (_e, intento) =>
      intento < 3
        ? Promise.reject(new Error(`proveedor caído (${intento})`))
        : Promise.resolve(),
    );
    registro.registrar(manejador);
    const id = await publicar();

    await despachador.procesarPendientes([id]);
    expect(await filaDelOutbox(id)).toMatchObject({
      intentos: 1,
      procesado_en: null,
      proxima_ejecucion: new Date(inicio + 1_000),
      ultimo_error: `${manejador.nombre}: proveedor caído (1)`,
    });

    // Antes de que venza la espera no se reintenta.
    expect(await despachador.procesarPendientes([id])).toBe(0);

    reloj.avanzar(1_000);
    await despachador.procesarPendientes([id]);
    expect(await filaDelOutbox(id)).toMatchObject({
      intentos: 2,
      proxima_ejecucion: new Date(inicio + 1_000 + 2_000),
    });

    reloj.avanzar(2_000);
    await despachador.procesarPendientes([id]);
    expect(await filaDelOutbox(id)).toMatchObject({
      intentos: 2,
      procesado_en: reloj.ahora(),
      ultimo_error: null,
    });
    expect(manejador.llamadas).toHaveLength(3);
  });

  it('tras el máximo de intentos marca el evento como fallido y deja de reintentarlo', async () => {
    const { reloj, registro, despachador, tipo, publicar } = montar(2004, {
      maximoDeIntentos: 3,
    });
    const manejador = manejadorDePrueba(tipo, () =>
      Promise.reject(new Error('siempre falla')),
    );
    registro.registrar(manejador);
    const id = await publicar();

    for (let i = 0; i < 3; i++) {
      await despachador.procesarPendientes([id]);
      reloj.avanzar(60_000);
    }

    const fila = await filaDelOutbox(id);
    expect(fila).toMatchObject({ intentos: 3, procesado_en: null });
    expect(fila.fallido_en).not.toBeNull();
    reloj.avanzar(24 * 60 * 60_000);
    expect(await despachador.procesarPendientes([id])).toBe(0);
    expect(manejador.llamadas).toHaveLength(3);
  });

  it('si un manejador falla, el reintento no repite a los que ya terminaron', async () => {
    const { reloj, registro, despachador, tipo, publicar } = montar(2005);
    const bien = manejadorDePrueba(tipo);
    const malUnaVez = manejadorDePrueba(tipo, (_e, intento) =>
      intento === 1
        ? Promise.reject(new Error('falla una vez'))
        : Promise.resolve(),
    );
    registro.registrar(bien);
    registro.registrar(malUnaVez);
    const id = await publicar();

    await despachador.procesarPendientes([id]);
    reloj.avanzar(1_000);
    await despachador.procesarPendientes([id]);

    expect(bien.llamadas).toHaveLength(1);
    expect(malUnaVez.llamadas).toHaveLength(2);
    expect((await filaDelOutbox(id)).procesado_en).not.toBeNull();
  });

  it('lo que escribe un manejador que falla se revierte, y se vuelve a intentar completo', async () => {
    const { reloj, registro, despachador, tipo, publicar } = montar(2006);
    const usuarioId = nuevoId();
    const manejador = manejadorDePrueba(tipo, async (_e, intento) => {
      await contexto.conexion().execute(
        sql`insert into identidad.usuarios (id, correo, nombre, rol)
            values (${usuarioId}, ${`${usuarioId}@prueba.invalid`}, 'Creado por un manejador', 'familiar')`,
      );
      if (intento === 1) throw new Error('falla después de escribir');
    });
    registro.registrar(manejador);
    const id = await publicar();

    await despachador.procesarPendientes([id]);
    const tras1 = await pool.query(
      'select 1 from identidad.usuarios where id = $1',
      [usuarioId],
    );
    expect(tras1.rowCount).toBe(0);

    reloj.avanzar(1_000);
    await despachador.procesarPendientes([id]);
    const tras2 = await pool.query(
      'select 1 from identidad.usuarios where id = $1',
      [usuarioId],
    );
    expect(tras2.rowCount).toBe(1);
  });

  it('un manejador puede publicar otro evento dentro de su misma transacción', async () => {
    const { registro, despachador, publicador, tipo, publicar } = montar(2007);
    const encadenadoId = nuevoId();
    registro.registrar(
      manejadorDePrueba(tipo, (evento) =>
        publicador.publicar({
          ...evento,
          id: encadenadoId,
          tipo: 'prueba.reaccion',
        }),
      ),
    );
    const id = await publicar();

    await despachador.procesarPendientes([id]);

    const { rowCount } = await pool.query(
      'select 1 from compartido.outbox where id = $1',
      [encadenadoId],
    );
    expect(rowCount).toBe(1);
  });

  it('el manejador corre con el ID de correlación del evento que atiende', async () => {
    const { registro, despachador, tipo, publicar } = montar(2011);
    let visto: string | undefined;
    registro.registrar(
      manejadorDePrueba(tipo, () => {
        visto = contextoDePeticion.idDeCorrelacion();
        return Promise.resolve();
      }),
    );
    const id = await publicar();

    await despachador.procesarPendientes([id]);

    const { rows } = await pool.query<{ id_de_correlacion: string }>(
      'select id_de_correlacion from compartido.outbox where id = $1',
      [id],
    );
    expect(visto).toBe(rows[0]?.id_de_correlacion);
  });

  it('un evento sin manejadores se marca procesado', async () => {
    const { despachador, publicar } = montar(2008);
    const id = await publicar();

    await despachador.procesarPendientes([id]);

    expect((await filaDelOutbox(id)).procesado_en).not.toBeNull();
  });

  it('mientras un evento está reservado por un despachador, otro no lo toma', async () => {
    const { registro, despachador, tipo, publicar } = montar(2009);
    let soltar!: () => void;
    const enCurso = new Promise<void>((resolver) => {
      soltar = resolver;
    });
    const manejador = manejadorDePrueba(tipo, () => enCurso);
    registro.registrar(manejador);
    const id = await publicar();

    const primero = despachador.procesarPendientes([id]);
    await vi.waitFor(() => expect(manejador.llamadas).toHaveLength(1));
    expect(await despachador.procesarPendientes([id])).toBe(0);

    soltar();
    expect(await primero).toBe(1);
    expect(manejador.llamadas).toHaveLength(1);
  });

  it('varios despachadores a la vez entregan cada evento exactamente una vez', async () => {
    const { reloj, registro, tipo, publicar } = montar(1990);
    const manejador = manejadorDePrueba(tipo);
    registro.registrar(manejador);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push(await publicar({ i }));

    const despachadores = Array.from(
      { length: 3 },
      () =>
        new DespachadorDeEventos(
          bd,
          contexto,
          registro,
          reloj,
          contextoDePeticion,
          {
            lote: 7,
          },
        ),
    );
    // Cada uno reclama lotes de 7 hasta que no quede nada.
    await Promise.all(
      despachadores.map(async (d) => {
        while ((await d.procesarPendientes()) > 0);
      }),
    );

    expect(manejador.llamadas.map((e) => e.id).sort()).toEqual([...ids].sort());
    const { rows } = await pool.query<{ pendientes: string }>(
      `select count(*) as pendientes from compartido.outbox
       where id = any($1::uuid[]) and procesado_en is null`,
      [ids],
    );
    expect(rows[0]?.pendientes).toBe('0');
  });

  it('programar() entrega al instante tras el commit, sin esperar al sondeo', async () => {
    const { reloj, registro, despachador, tipo } = montar(2010);
    const manejador = manejadorDePrueba(tipo);
    registro.registrar(manejador);
    const publicador = new PublicadorDeEventosOutbox(contexto, despachador);
    const id = nuevoId();

    await contexto.ejecutar(() =>
      publicador.publicar({
        id,
        tipo,
        version: 1,
        ocurridoEn: reloj.ahora().toISOString(),
        idDeCorrelacion: nuevoId(),
        datos: {},
      }),
    );
    await despachador.esperarEntregas();

    expect(manejador.llamadas.map((e) => e.id)).toEqual([id]);
    expect((await filaDelOutbox(id)).procesado_en).not.toBeNull();
  });
});
