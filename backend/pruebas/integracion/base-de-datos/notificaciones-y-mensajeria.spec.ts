import {
  CHECK,
  FORANEA,
  UNICA,
  conectarBd,
  insertar,
  nuevoId,
  rechazo,
} from '../../soporte/bd.js';

describe('esquema notificaciones', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  const notificacion = (extra: Record<string, unknown> = {}) => ({
    id: nuevoId(),
    destinatario_id: nuevoId(),
    evento_id: nuevoId(),
    tipo: 'alerta_generada',
    canal: 'sms',
    ...extra,
  });

  it('acepta una notificación pendiente con prioridad normal por defecto', async () => {
    const n = notificacion();
    await insertar(bd, 'notificaciones.notificaciones', n);

    const { rows } = await bd.query(
      `select prioridad, estado, intentos, parametros from notificaciones.notificaciones where id = $1`,
      [n.id],
    );
    expect(rows[0]).toEqual({
      prioridad: 'normal',
      estado: 'pendiente',
      intentos: 0,
      parametros: {},
    });
  });

  it('reprocesar un evento no repite el aviso al mismo destinatario por el mismo canal', async () => {
    const primera = notificacion();
    await insertar(bd, 'notificaciones.notificaciones', primera);

    const r = await rechazo(() =>
      insertar(
        bd,
        'notificaciones.notificaciones',
        notificacion({
          evento_id: primera.evento_id,
          destinatario_id: primera.destinatario_id,
          tipo: primera.tipo,
          canal: primera.canal,
        }),
      ),
    );
    expect(r).toMatchObject({
      codigo: UNICA,
      restriccion: 'notificaciones_deduplicacion_unica',
    });
  });

  it('el mismo evento sí puede avisar por otro canal o a otro destinatario', async () => {
    const base = notificacion();
    await insertar(bd, 'notificaciones.notificaciones', base);
    await insertar(
      bd,
      'notificaciones.notificaciones',
      notificacion({
        evento_id: base.evento_id,
        destinatario_id: base.destinatario_id,
        tipo: base.tipo,
        canal: 'push',
      }),
    );
    await insertar(
      bd,
      'notificaciones.notificaciones',
      notificacion({
        evento_id: base.evento_id,
        tipo: base.tipo,
        canal: base.canal,
      }),
    );
  });

  it.each([
    [
      'un canal desconocido',
      { canal: 'paloma_mensajera' },
      'notificaciones_canal_valido',
    ],
    [
      'una prioridad desconocida',
      { prioridad: 'urgentisima' },
      'notificaciones_prioridad_valida',
    ],
    [
      'un estado desconocido',
      { estado: 'perdida' },
      'notificaciones_estado_valido',
    ],
    ['intentos negativos', { intentos: -1 }, 'notificaciones_intentos_validos'],
    [
      'entregada sin fecha de entrega',
      { estado: 'entregada' },
      'notificaciones_entrega_con_fecha',
    ],
  ])('rechaza %s', async (_nombre, extra, restriccion) => {
    const r = await rechazo(() =>
      insertar(bd, 'notificaciones.notificaciones', notificacion(extra)),
    );
    expect(r).toMatchObject({ codigo: CHECK, restriccion });
  });

  it('registra los intentos de envío de una notificación y rechaza los de una inexistente', async () => {
    const n = notificacion();
    await insertar(bd, 'notificaciones.notificaciones', n);
    await insertar(bd, 'notificaciones.intentos_de_envio', {
      id: nuevoId(),
      notificacion_id: n.id,
      resultado: 'error',
    });
    await insertar(bd, 'notificaciones.intentos_de_envio', {
      id: nuevoId(),
      notificacion_id: n.id,
      resultado: 'exito',
    });

    const huerfano = await rechazo(() =>
      insertar(bd, 'notificaciones.intentos_de_envio', {
        id: nuevoId(),
        notificacion_id: nuevoId(),
        resultado: 'exito',
      }),
    );
    const invalido = await rechazo(() =>
      insertar(bd, 'notificaciones.intentos_de_envio', {
        id: nuevoId(),
        notificacion_id: n.id,
        resultado: 'quizas',
      }),
    );
    expect(huerfano.codigo).toBe(FORANEA);
    expect(invalido.restriccion).toBe('intentos_resultado_valido');
  });

  describe('preferencias', () => {
    it('acepta canales válidos y un horario silencioso completo', async () => {
      await insertar(bd, 'notificaciones.preferencias_de_notificacion', {
        usuario_id: nuevoId(),
        canales: ['app', 'sms'],
        silencio_desde: '22:00',
        silencio_hasta: '06:00',
      });
    });

    it('rechaza un horario silencioso incompleto y canales desconocidos', async () => {
      const incompleto = await rechazo(() =>
        insertar(bd, 'notificaciones.preferencias_de_notificacion', {
          usuario_id: nuevoId(),
          silencio_desde: '22:00',
        }),
      );
      const canales = await rechazo(() =>
        insertar(bd, 'notificaciones.preferencias_de_notificacion', {
          usuario_id: nuevoId(),
          canales: ['telegrama'],
        }),
      );
      expect(incompleto.restriccion).toBe('preferencias_silencio_completo');
      expect(canales.restriccion).toBe('preferencias_canales_validos');
    });
  });
});

describe('esquema mensajeria', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  const conversacion = (extra: Record<string, unknown> = {}) => ({
    id: nuevoId(),
    familiar_id: nuevoId(),
    cuidador_id: nuevoId(),
    ...extra,
  });

  const mensaje = (
    conversacionId: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id: nuevoId(),
    conversacion_id: conversacionId,
    autor_id: nuevoId(),
    autor_rol: 'familiar',
    texto: 'Hola, ¿cómo amaneció doña Carmen?',
    id_de_cliente: nuevoId(),
    ...extra,
  });

  it('«obtener o crear»: no puede haber dos conversaciones entre la misma familia y el mismo cuidador', async () => {
    const primera = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', primera);

    const r = await rechazo(() =>
      insertar(
        bd,
        'mensajeria.conversaciones',
        conversacion({
          familiar_id: primera.familiar_id,
          cuidador_id: primera.cuidador_id,
        }),
      ),
    );
    expect(r).toMatchObject({
      codigo: UNICA,
      restriccion: 'conversaciones_pareja_unica',
    });
  });

  it('una familia puede hablar con varios cuidadores, y un cuidador con varias familias', async () => {
    const a = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', a);
    await insertar(
      bd,
      'mensajeria.conversaciones',
      conversacion({ familiar_id: a.familiar_id }),
    );
    await insertar(
      bd,
      'mensajeria.conversaciones',
      conversacion({ cuidador_id: a.cuidador_id }),
    );
  });

  it('guarda un mensaje y rechaza uno de una conversación inexistente', async () => {
    const c = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', c);
    await insertar(bd, 'mensajeria.mensajes', mensaje(c.id));

    const r = await rechazo(() =>
      insertar(bd, 'mensajeria.mensajes', mensaje(nuevoId())),
    );
    expect(r.codigo).toBe(FORANEA);
  });

  it('un reenvío por mala conexión (mismo id de cliente) no duplica el mensaje', async () => {
    const c = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', c);
    const original = mensaje(c.id);
    await insertar(bd, 'mensajeria.mensajes', original);

    const r = await rechazo(() =>
      insertar(
        bd,
        'mensajeria.mensajes',
        mensaje(c.id, {
          autor_id: original.autor_id,
          id_de_cliente: original.id_de_cliente,
        }),
      ),
    );
    expect(r).toMatchObject({
      codigo: UNICA,
      restriccion: 'mensajes_reenvio_unico',
    });
  });

  it.each([
    ['vacío', '', 'mensajes_texto_valido'],
    ['de más de 1000 caracteres', 'x'.repeat(1001), 'mensajes_texto_valido'],
  ])('rechaza un mensaje %s', async (_nombre, texto, restriccion) => {
    const c = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', c);

    const r = await rechazo(() =>
      insertar(bd, 'mensajeria.mensajes', mensaje(c.id, { texto })),
    );
    expect(r).toMatchObject({ codigo: CHECK, restriccion });
  });

  it('acepta un mensaje de exactamente 1000 caracteres', async () => {
    const c = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', c);
    await insertar(
      bd,
      'mensajeria.mensajes',
      mensaje(c.id, { texto: 'x'.repeat(1000) }),
    );
  });

  it('rechaza un autor que no sea familiar ni cuidador', async () => {
    const c = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', c);

    const r = await rechazo(() =>
      insertar(
        bd,
        'mensajeria.mensajes',
        mensaje(c.id, { autor_rol: 'administrador' }),
      ),
    );
    expect(r.restriccion).toBe('mensajes_autor_valido');
  });

  it('la paginación por cursor entrega los mensajes del más reciente al más antiguo', async () => {
    const c = conversacion();
    await insertar(bd, 'mensajeria.conversaciones', c);
    for (let i = 1; i <= 5; i++) {
      await insertar(
        bd,
        'mensajeria.mensajes',
        mensaje(c.id, {
          texto: `mensaje ${i}`,
          creado_en: new Date(Date.UTC(2026, 9, 1, 10, i)).toISOString(),
        }),
      );
    }

    const { rows } = await bd.query(
      `select texto from mensajeria.mensajes where conversacion_id = $1 order by creado_en desc, id desc limit 3`,
      [c.id],
    );
    expect(rows.map((f) => f.texto)).toEqual([
      'mensaje 5',
      'mensaje 4',
      'mensaje 3',
    ]);
  });
});
