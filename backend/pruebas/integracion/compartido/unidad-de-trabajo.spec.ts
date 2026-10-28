import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { EventoDeIntegracion } from '../../../src/compartido/eventos/evento-de-integracion.js';
import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { DespachadorDeEventos } from '../../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { PublicadorDeEventosOutbox } from '../../../src/compartido/infraestructura/outbox/publicador-de-eventos-outbox.js';
import { conectarDrizzle, nuevoId } from '../../soporte/bd.js';

// M0 §6: «un error dentro de la transacción revierte el cambio y el evento del outbox».
describe('unidad de trabajo y publicación en el outbox', () => {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  const programar = vi.fn();
  const publicador = new PublicadorDeEventosOutbox(contexto, {
    programar,
  } as unknown as DespachadorDeEventos);

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    programar.mockClear();
  });

  const evento = (
    extra: Partial<EventoDeIntegracion> = {},
  ): EventoDeIntegracion => ({
    id: nuevoId(),
    tipo: 'prueba.algo_ocurrio',
    version: 1,
    ocurridoEn: new Date().toISOString(),
    idDeCorrelacion: nuevoId(),
    datos: { servicioId: nuevoId(), horas: 4 },
    ...extra,
  });

  // Un «cambio de negocio» cualquiera, escrito con la conexión que da el contexto,
  // como lo haría un repositorio.
  async function crearUsuario(id: string): Promise<void> {
    await contexto.conexion().execute(
      sql`insert into identidad.usuarios (id, correo, nombre, rol)
          values (${id}, ${`${id}@prueba.invalid`}, 'Usuario de prueba', 'familiar')`,
    );
  }

  async function existe(tabla: string, id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `select 1 from ${tabla} where id = $1`,
      [id],
    );
    return rowCount === 1;
  }

  it('confirma juntos el cambio y el evento, y avisa al despachador después del commit', async () => {
    const usuarioId = nuevoId();
    const e = evento();

    const resultado = await contexto.ejecutar(async () => {
      await crearUsuario(usuarioId);
      await publicador.publicar(e);
      // Antes del commit nadie más ve los cambios ni se avisó al despachador.
      expect(await existe('identidad.usuarios', usuarioId)).toBe(false);
      expect(programar).not.toHaveBeenCalled();
      return 'listo';
    });

    expect(resultado).toBe('listo');
    expect(await existe('identidad.usuarios', usuarioId)).toBe(true);
    expect(programar).toHaveBeenCalledExactlyOnceWith([e.id]);

    const { rows } = await pool.query(
      `select tipo, version, datos, id_de_correlacion, creado_en, proxima_ejecucion, intentos, procesado_en
       from compartido.outbox where id = $1`,
      [e.id],
    );
    expect(rows[0]).toEqual({
      tipo: e.tipo,
      version: 1,
      datos: e.datos,
      id_de_correlacion: e.idDeCorrelacion,
      creado_en: new Date(e.ocurridoEn),
      proxima_ejecucion: new Date(e.ocurridoEn),
      intentos: 0,
      procesado_en: null,
    });
  });

  it('si el trabajo falla, revierte el cambio Y el evento, y propaga el error', async () => {
    const usuarioId = nuevoId();
    const e = evento();

    await expect(
      contexto.ejecutar(async () => {
        await crearUsuario(usuarioId);
        await publicador.publicar(e);
        throw new Error('falló el caso de uso');
      }),
    ).rejects.toThrow('falló el caso de uso');

    expect(await existe('identidad.usuarios', usuarioId)).toBe(false);
    expect(await existe('compartido.outbox', e.id)).toBe(false);
    expect(programar).not.toHaveBeenCalled();
  });

  it('una unidad anidada se une a la externa: si la externa falla, se revierte todo', async () => {
    const usuarioId = nuevoId();

    await expect(
      contexto.ejecutar(async () => {
        await contexto.ejecutar(() => crearUsuario(usuarioId));
        throw new Error('falla después de la unidad interna');
      }),
    ).rejects.toThrow();

    expect(await existe('identidad.usuarios', usuarioId)).toBe(false);
  });

  it('dos unidades simultáneas no se mezclan: una falla y la otra se confirma', async () => {
    const confirmado = nuevoId();
    const revertido = nuevoId();
    let soltar!: () => void;
    const ambasEscribieron = new Promise<void>((resolver) => {
      soltar = resolver;
    });

    const [ok, falla] = await Promise.allSettled([
      contexto.ejecutar(async () => {
        await crearUsuario(confirmado);
        await ambasEscribieron;
      }),
      contexto.ejecutar(async () => {
        await crearUsuario(revertido);
        soltar();
        throw new Error('solo esta falla');
      }),
    ]);

    expect(ok.status).toBe('fulfilled');
    expect(falla.status).toBe('rejected');
    expect(await existe('identidad.usuarios', confirmado)).toBe(true);
    expect(await existe('identidad.usuarios', revertido)).toBe(false);
  });

  it('fuera de una unidad, los repositorios usan el pool; dentro, la transacción', async () => {
    expect(contexto.conexion()).toBe(bd);
    await contexto.ejecutar(() => {
      expect(contexto.conexion()).not.toBe(bd);
      expect(contexto.conexion()).toBe(contexto.transaccionActual());
      return Promise.resolve();
    });
  });

  it('publicar fuera de una unidad de trabajo falla y no deja el evento', async () => {
    const e = evento();

    await expect(publicador.publicar(e)).rejects.toThrow(
      /dentro de una unidad de trabajo/,
    );
    expect(await existe('compartido.outbox', e.id)).toBe(false);
  });

  it('rechaza un evento con fecha inválida', async () => {
    await expect(
      contexto.ejecutar(() =>
        publicador.publicar(evento({ ocurridoEn: 'ayer' })),
      ),
    ).rejects.toThrow(/fecha inválida/);
  });

  it('las acciones posteriores al commit solo corren si se confirma, y un fallo en ellas no afecta el resultado', async () => {
    const registrarError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const accion = vi.fn();

    await expect(
      contexto.ejecutar(() => {
        contexto.alConfirmar(accion);
        return Promise.reject(new Error('revertida'));
      }),
    ).rejects.toThrow();
    expect(accion).not.toHaveBeenCalled();

    const resultado = await contexto.ejecutar(() => {
      contexto.alConfirmar(() => {
        throw new Error('falla después del commit');
      });
      contexto.alConfirmar(accion);
      return Promise.resolve(42);
    });
    expect(resultado).toBe(42);
    expect(accion).toHaveBeenCalledOnce();
    expect(registrarError).toHaveBeenCalledWith(
      expect.stringContaining('falla después del commit'),
    );
    registrarError.mockRestore();

    expect(() => contexto.alConfirmar(accion)).toThrow(
      /dentro de una unidad de trabajo/,
    );
  });
});
