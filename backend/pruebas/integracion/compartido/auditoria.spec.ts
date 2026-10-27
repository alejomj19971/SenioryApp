import { AuditoriaPostgres } from '../../../src/compartido/infraestructura/auditoria/auditoria-postgres.js';
import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { ContextoDePeticionAls } from '../../../src/compartido/infraestructura/contexto-de-peticion-als.js';
import { GeneradorDeIdsUuidV7 } from '../../../src/compartido/infraestructura/generador-de-ids-uuid-v7.js';
import { conectarDrizzle, nuevoId } from '../../soporte/bd.js';
import { RelojFalso } from '../../soporte/dobles.js';

describe('AuditoriaPostgres', () => {
  const { pool, bd } = conectarDrizzle();
  const reloj = new RelojFalso('2026-10-21T15:30:00.000Z');
  const contextoDePeticion = new ContextoDePeticionAls();
  const auditoria = new AuditoriaPostgres(
    bd,
    new GeneradorDeIdsUuidV7(),
    reloj,
    contextoDePeticion,
  );
  const contexto = new ContextoTransaccional(bd);

  afterAll(async () => {
    await pool.end();
  });

  async function registrosDe(recursoId: string) {
    const { rows } = await pool.query(
      `select actor_id, accion, recurso_tipo, recurso_id, resultado, metadatos, ocurrido_en
       from compartido.auditoria where recurso_id = $1`,
      [recursoId],
    );
    return rows;
  }

  it('guarda quién hizo qué, sobre qué recurso y con qué resultado', async () => {
    const actorId = nuevoId();
    const recursoId = nuevoId();

    await auditoria.registrar({
      actorId,
      accion: 'teleasistencia.leer_signos',
      recursoTipo: 'adulto_mayor',
      recursoId,
      resultado: 'permitido',
      metadatos: { lecturas: 7, rango: 'semana' },
    });

    expect(await registrosDe(recursoId)).toEqual([
      {
        actor_id: actorId,
        accion: 'teleasistencia.leer_signos',
        recurso_tipo: 'adulto_mayor',
        recurso_id: recursoId,
        resultado: 'permitido',
        metadatos: { lecturas: 7, rango: 'semana' },
        ocurrido_en: new Date('2026-10-21T15:30:00.000Z'),
      },
    ]);
  });

  it('un acceso denegado queda registrado aunque el caso de uso se revierta (E6)', async () => {
    const recursoId = nuevoId();

    await expect(
      contexto.ejecutar(async () => {
        await auditoria.registrar({
          actorId: nuevoId(),
          accion: 'teleasistencia.leer_signos',
          recursoTipo: 'adulto_mayor',
          recursoId,
          resultado: 'denegado',
        });
        throw new Error('sin vínculo con la persona mayor');
      }),
    ).rejects.toThrow();

    expect(await registrosDe(recursoId)).toEqual([
      expect.objectContaining({ resultado: 'denegado', metadatos: null }),
    ]);
  });

  it('acepta acciones del sistema (sin actor)', async () => {
    const recursoId = nuevoId();

    await auditoria.registrar({
      actorId: null,
      accion: 'reservas.expirar_solicitud',
      recursoTipo: 'servicio',
      recursoId,
      resultado: 'permitido',
    });

    expect(await registrosDe(recursoId)).toEqual([
      expect.objectContaining({ actor_id: null }),
    ]);
  });

  it('guarda el ID de correlación de la petición en curso', async () => {
    const recursoId = nuevoId();
    const idDeCorrelacion = nuevoId();

    await contextoDePeticion.ejecutar({ idDeCorrelacion }, () =>
      auditoria.registrar({
        actorId: null,
        accion: 'prueba.correlacion',
        recursoTipo: 'prueba',
        recursoId,
        resultado: 'permitido',
      }),
    );

    const { rows } = await pool.query<{ id_de_correlacion: string }>(
      'select id_de_correlacion from compartido.auditoria where recurso_id = $1',
      [recursoId],
    );
    expect(rows[0]?.id_de_correlacion).toBe(idDeCorrelacion);
  });
});
