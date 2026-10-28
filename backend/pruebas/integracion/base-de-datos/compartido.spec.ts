import {
  CHECK,
  SOLO_INSERCION,
  UNICA,
  conectarBd,
  insertar,
  nuevoId,
  rechazo,
} from '../../soporte/bd.js';

describe('esquema compartido', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  const eventoValido = (extra: Record<string, unknown> = {}) => ({
    id: nuevoId(),
    tipo: 'reservas.servicio_confirmado',
    version: 1,
    datos: JSON.stringify({ servicioId: nuevoId() }),
    id_de_correlacion: nuevoId(),
    ...extra,
  });

  describe('outbox', () => {
    it('acepta un evento pendiente con valores por defecto', async () => {
      const evento = eventoValido();
      await insertar(bd, 'compartido.outbox', evento);

      const { rows } = await bd.query(
        `select intentos, procesado_en, fallido_en from compartido.outbox where id = $1`,
        [evento.id],
      );
      expect(rows[0]).toEqual({
        intentos: 0,
        procesado_en: null,
        fallido_en: null,
      });
    });

    it('rechaza intentos negativos', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'compartido.outbox', eventoValido({ intentos: -1 })),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'outbox_intentos_validos',
      });
    });

    it('rechaza un evento a la vez procesado y fallido', async () => {
      const ahora = new Date().toISOString();
      const r = await rechazo(() =>
        insertar(
          bd,
          'compartido.outbox',
          eventoValido({ procesado_en: ahora, fallido_en: ahora }),
        ),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'outbox_estado_coherente',
      });
    });

    it('rechaza un id de evento repetido', async () => {
      const evento = eventoValido();
      await insertar(bd, 'compartido.outbox', evento);
      const r = await rechazo(() => insertar(bd, 'compartido.outbox', evento));
      expect(r.codigo).toBe(UNICA);
    });
  });

  describe('eventos_consumidos (idempotencia de los manejadores)', () => {
    it('un manejador no puede consumir dos veces el mismo evento', async () => {
      const fila = {
        manejador: 'notificaciones.al_confirmarse_servicio',
        evento_id: nuevoId(),
      };
      await insertar(bd, 'compartido.eventos_consumidos', fila);

      const r = await rechazo(() =>
        insertar(bd, 'compartido.eventos_consumidos', fila),
      );
      expect(r.codigo).toBe(UNICA);
    });

    it('dos manejadores distintos sí pueden consumir el mismo evento', async () => {
      const eventoId = nuevoId();
      await insertar(bd, 'compartido.eventos_consumidos', {
        manejador: 'a',
        evento_id: eventoId,
      });
      await insertar(bd, 'compartido.eventos_consumidos', {
        manejador: 'b',
        evento_id: eventoId,
      });
    });
  });

  describe('auditoria (E6)', () => {
    const entrada = (extra: Record<string, unknown> = {}) => ({
      id: nuevoId(),
      accion: 'teleasistencia.leer_signos',
      recurso_tipo: 'adulto_mayor',
      resultado: 'denegado',
      ...extra,
    });

    it('registra un acceso', async () => {
      await insertar(bd, 'compartido.auditoria', entrada());
    });

    it.each(['permitido', 'denegado', 'error'])(
      'acepta el resultado %s',
      async (resultado) => {
        await insertar(bd, 'compartido.auditoria', entrada({ resultado }));
      },
    );

    it('rechaza un resultado desconocido', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'compartido.auditoria', entrada({ resultado: 'quizas' })),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'auditoria_resultado_valido',
      });
    });

    it('es de solo inserción: no se puede modificar un registro', async () => {
      const fila = entrada();
      await insertar(bd, 'compartido.auditoria', fila);

      const r = await rechazo(() =>
        bd.query(
          `update compartido.auditoria set resultado = 'permitido' where id = $1`,
          [fila.id],
        ),
      );
      expect(r.codigo).toBe(SOLO_INSERCION);
      expect(r.mensaje).toContain('solo inserción');
    });

    it('es de solo inserción: no se puede borrar un registro', async () => {
      const fila = entrada();
      await insertar(bd, 'compartido.auditoria', fila);

      const r = await rechazo(() =>
        bd.query(`delete from compartido.auditoria where id = $1`, [fila.id]),
      );
      expect(r.codigo).toBe(SOLO_INSERCION);

      const { rowCount } = await bd.query(
        `select 1 from compartido.auditoria where id = $1`,
        [fila.id],
      );
      expect(rowCount).toBe(1);
    });
  });
});
