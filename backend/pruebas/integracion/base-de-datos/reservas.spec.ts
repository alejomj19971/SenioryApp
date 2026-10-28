import {
  CHECK,
  FORANEA,
  UNICA,
  conectarBd,
  enDosHoras,
  insertar,
  nuevoId,
  rechazo,
  servicioValido,
} from '../../soporte/bd.js';

describe('esquema reservas', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  describe('franjas (dato de referencia decidido el 2026-10-26)', () => {
    it('trae mañana 06–12, tarde 12–18 y noche 18–06 (la noche cruza la medianoche)', async () => {
      const { rows } = await bd.query(
        `select jornada, hora_inicio::text as inicio, hora_fin::text as fin, cruza_medianoche
           from reservas.franjas order by hora_inicio`,
      );

      expect(rows).toEqual([
        {
          jornada: 'manana',
          inicio: '06:00:00',
          fin: '12:00:00',
          cruza_medianoche: false,
        },
        {
          jornada: 'tarde',
          inicio: '12:00:00',
          fin: '18:00:00',
          cruza_medianoche: false,
        },
        {
          jornada: 'noche',
          inicio: '18:00:00',
          fin: '06:00:00',
          cruza_medianoche: true,
        },
      ]);
    });

    it('rechaza una franja cuyo cruce de medianoche no coincide con sus horas', async () => {
      const r = await rechazo(() =>
        bd.query(
          `update reservas.franjas set cruza_medianoche = true where jornada = 'manana'`,
        ),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'franjas_cruce_coherente',
      });
    });

    it('rechaza una jornada que no existe', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'reservas.franjas', {
          jornada: 'madrugada',
          hora_inicio: '00:00',
          hora_fin: '06:00',
          cruza_medianoche: false,
        }),
      );
      expect(r.restriccion).toBe('franjas_jornada_valida');
    });
  });

  describe('servicios', () => {
    it('acepta el servicio del ejemplo del pitch: $20.000 × 1 h → total $21.600', async () => {
      await insertar(bd, 'reservas.servicios', servicioValido());
    });

    it.each([0, 9])('E9: rechaza %s horas (solo de 1 a 8)', async (horas) => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'reservas.servicios',
          servicioValido({
            horas,
            subtotal: 20_000 * horas,
            total_familia: 20_000 * horas + 1600,
            pago_profesional: 0,
          }),
        ),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'servicios_horas_validas',
      });
    });

    it('rechaza horas negativas (también rompen el desglose: basta con que falle una de las dos reglas)', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'reservas.servicios',
          servicioValido({
            horas: -1,
            subtotal: -20_000,
            total_familia: -18_400,
            pago_profesional: 0,
          }),
        ),
      );
      expect(r.codigo).toBe(CHECK);
      expect([
        'servicios_horas_validas',
        'servicios_desglose_coherente',
      ]).toContain(r.restriccion);
    });

    it.each([1, 4, 8])(
      'acepta %s horas con su desglose coherente',
      async (horas) => {
        const subtotal = 20_000 * horas;
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({
            horas,
            subtotal,
            cargo_familia: subtotal * 0.08,
            total_familia: subtotal * 1.08,
            pago_profesional: subtotal * 0.9,
          }),
        );
      },
    );

    describe('E10: el desglose congelado tiene que cuadrar', () => {
      it.each([
        [
          'el subtotal no es tarifa × horas',
          { subtotal: 25_000, total_familia: 26_600 },
        ],
        ['el total no es subtotal + cargo', { total_familia: 30_000 }],
        [
          'el pago al profesional supera el subtotal',
          { pago_profesional: 25_000 },
        ],
        ['el pago al profesional es negativo', { pago_profesional: -1 }],
        [
          'el cargo a la familia es negativo',
          { cargo_familia: -100, total_familia: 19_900 },
        ],
        [
          'la tarifa es cero',
          {
            tarifa_hora: 0,
            subtotal: 0,
            total_familia: 1600,
            pago_profesional: 0,
          },
        ],
      ])('rechaza cuando %s', async (_nombre, extra) => {
        const r = await rechazo(() =>
          insertar(bd, 'reservas.servicios', servicioValido(extra)),
        );
        expect(r.restriccion).toBe('servicios_desglose_coherente');
      });
    });

    it('rechaza una jornada que no está en las franjas (clave foránea)', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'reservas.servicios',
          servicioValido({ jornada: 'madrugada' }),
        ),
      );
      expect(r.codigo).toBe(FORANEA);
    });

    it.each([
      [
        'un estado desconocido',
        { estado: 'perdido' },
        'servicios_estado_valido',
      ],
      [
        'un medio de pago desconocido',
        { medio_de_pago: 'efectivo' },
        'servicios_medio_valido',
      ],
      [
        'una solicitud sin plazo de aceptación',
        { solicitud_expira_en: null },
        'servicios_solicitud_con_plazo',
      ],
    ])('rechaza %s', async (_nombre, extra, restriccion) => {
      const r = await rechazo(() =>
        insertar(bd, 'reservas.servicios', servicioValido(extra)),
      );
      expect(r.restriccion).toBe(restriccion);
    });

    describe('marcas de tiempo coherentes con el estado', () => {
      const ahora = () => new Date().toISOString();

      it.each([
        ['cancelado sin fecha de cancelación', { estado: 'cancelado' }],
        [
          'aceptado sin fecha de aceptación',
          { estado: 'aceptado', solicitud_expira_en: null },
        ],
        [
          'en curso sin fecha de inicio',
          {
            estado: 'en_curso',
            aceptado_en: new Date().toISOString(),
            solicitud_expira_en: null,
          },
        ],
        [
          'finalizado sin fecha de finalización',
          {
            estado: 'finalizado',
            aceptado_en: new Date().toISOString(),
            iniciado_en: new Date().toISOString(),
            solicitud_expira_en: null,
          },
        ],
      ])('rechaza un servicio %s', async (_nombre, extra) => {
        const r = await rechazo(() =>
          insertar(bd, 'reservas.servicios', servicioValido(extra)),
        );
        expect(r.restriccion).toBe('servicios_marcas_de_tiempo_coherentes');
      });

      it('acepta el recorrido completo: finalizado con todas sus marcas', async () => {
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({
            estado: 'finalizado',
            solicitud_expira_en: null,
            aceptado_en: ahora(),
            iniciado_en: ahora(),
            finalizado_en: ahora(),
          }),
        );
      });
    });

    describe('sin doble reserva del mismo turno', () => {
      const turno = () => ({
        cuidador_id: nuevoId(),
        fecha: '2026-11-20',
        jornada: 'tarde',
      });

      it('un cuidador no puede tener dos servicios ACTIVOS en la misma fecha y jornada', async () => {
        const t = turno();
        await insertar(bd, 'reservas.servicios', servicioValido(t));

        const r = await rechazo(() =>
          insertar(bd, 'reservas.servicios', servicioValido(t)),
        );
        expect(r).toMatchObject({
          codigo: UNICA,
          restriccion: 'servicios_sin_doble_reserva',
        });
      });

      it.each(['solicitado', 'aceptado', 'en_curso'])(
        'el primer servicio en estado %s bloquea el turno',
        async (estado) => {
          const t = turno();
          const marcas =
            estado === 'solicitado'
              ? {}
              : {
                  solicitud_expira_en: null,
                  aceptado_en: new Date().toISOString(),
                  ...(estado === 'en_curso'
                    ? { iniciado_en: new Date().toISOString() }
                    : {}),
                };
          await insertar(
            bd,
            'reservas.servicios',
            servicioValido({ ...t, estado, ...marcas }),
          );

          const r = await rechazo(() =>
            insertar(bd, 'reservas.servicios', servicioValido(t)),
          );
          expect(r.restriccion).toBe('servicios_sin_doble_reserva');
        },
      );

      it('si el primero se canceló, el turno queda libre para otra familia', async () => {
        const t = turno();
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({
            ...t,
            estado: 'cancelado',
            solicitud_expira_en: null,
            cancelado_en: new Date().toISOString(),
            motivo_cancelacion: 'expirada',
          }),
        );
        await insertar(bd, 'reservas.servicios', servicioValido(t));
      });

      it('un servicio finalizado tampoco bloquea el turno (ya pasó)', async () => {
        const t = turno();
        const ahora = new Date().toISOString();
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({
            ...t,
            estado: 'finalizado',
            solicitud_expira_en: null,
            aceptado_en: ahora,
            iniciado_en: ahora,
            finalizado_en: ahora,
          }),
        );
        await insertar(bd, 'reservas.servicios', servicioValido(t));
      });

      it('el mismo cuidador en otra jornada, otra fecha, o con otro cuidador, no choca', async () => {
        const t = turno();
        await insertar(bd, 'reservas.servicios', servicioValido(t));
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({ ...t, jornada: 'noche' }),
        );
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({ ...t, fecha: '2026-11-21' }),
        );
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({ ...t, cuidador_id: nuevoId() }),
        );
      });

      it('CONCURRENCIA: dos familias reservan al mismo cuidador a la vez → solo una gana, la otra recibe conflicto', async () => {
        const t = turno();

        const resultados = await Promise.allSettled([
          insertar(bd, 'reservas.servicios', servicioValido(t)),
          insertar(bd, 'reservas.servicios', servicioValido(t)),
        ]);

        const aceptadas = resultados.filter((r) => r.status === 'fulfilled');
        const rechazadas = resultados.filter((r) => r.status === 'rejected');
        expect(aceptadas).toHaveLength(1);
        expect(rechazadas).toHaveLength(1);
        expect((rechazadas[0] as PromiseRejectedResult).reason).toMatchObject({
          code: UNICA,
        });

        const { rows } = await bd.query(
          `select count(*)::int as total from reservas.servicios where cuidador_id = $1 and fecha = $2 and jornada = $3`,
          [t.cuidador_id, t.fecha, t.jornada],
        );
        expect(rows[0]?.total).toBe(1);
      });

      it('CONCURRENCIA: diez solicitudes simultáneas al mismo turno → exactamente una se acepta', async () => {
        const t = turno();

        const resultados = await Promise.allSettled(
          Array.from({ length: 10 }, () =>
            insertar(bd, 'reservas.servicios', servicioValido(t)),
          ),
        );

        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
          1,
        );
      });
    });

    describe('reintentos seguros', () => {
      it('la misma llave de idempotencia de la misma familia no crea dos servicios', async () => {
        const primero = servicioValido();
        await insertar(bd, 'reservas.servicios', primero);

        const r = await rechazo(() =>
          insertar(
            bd,
            'reservas.servicios',
            servicioValido({
              familiar_id: primero.familiar_id,
              clave_idempotencia: primero.clave_idempotencia,
            }),
          ),
        );
        expect(r).toMatchObject({
          codigo: UNICA,
          restriccion: 'servicios_idempotencia_unica',
        });
      });

      it('otra familia puede usar la misma llave', async () => {
        const primero = servicioValido();
        await insertar(bd, 'reservas.servicios', primero);
        await insertar(
          bd,
          'reservas.servicios',
          servicioValido({ clave_idempotencia: primero.clave_idempotencia }),
        );
      });
    });
  });

  describe('historial de estados y calificaciones', () => {
    it('registra las transiciones de un servicio y rechaza las de uno inexistente', async () => {
      const servicio = servicioValido();
      await insertar(bd, 'reservas.servicios', servicio);
      await insertar(bd, 'reservas.historial_de_estados', {
        id: nuevoId(),
        servicio_id: servicio.id,
        desde: null,
        hacia: 'solicitado',
        accion: 'solicitar',
        actor_id: servicio.familiar_id,
      });
      await insertar(bd, 'reservas.historial_de_estados', {
        id: nuevoId(),
        servicio_id: servicio.id,
        desde: 'solicitado',
        hacia: 'cancelado',
        accion: 'expirar',
        actor_id: null,
      });

      const r = await rechazo(() =>
        insertar(bd, 'reservas.historial_de_estados', {
          id: nuevoId(),
          servicio_id: nuevoId(),
          hacia: 'solicitado',
          accion: 'solicitar',
        }),
      );
      expect(r.codigo).toBe(FORANEA);
    });

    it('un servicio solo recibe una calificación, de 1 a 5', async () => {
      const servicio = servicioValido();
      await insertar(bd, 'reservas.servicios', servicio);
      const calificacion = (extra: Record<string, unknown> = {}) => ({
        servicio_id: servicio.id,
        familiar_id: servicio.familiar_id,
        calificacion: 5,
        ...extra,
      });
      await insertar(bd, 'reservas.calificaciones', calificacion());

      const repetida = await rechazo(() =>
        insertar(bd, 'reservas.calificaciones', calificacion()),
      );
      const otro = servicioValido();
      await insertar(bd, 'reservas.servicios', otro);
      const fueraDeRango = await rechazo(() =>
        insertar(bd, 'reservas.calificaciones', {
          ...calificacion({ calificacion: 6 }),
          servicio_id: otro.id,
        }),
      );

      expect(repetida.codigo).toBe(UNICA);
      expect(fueraDeRango.restriccion).toBe('calificaciones_valor_valido');
    });
  });

  it('la tarea de expiración encuentra las solicitudes vencidas por su índice parcial', async () => {
    const vencida = servicioValido({
      solicitud_expira_en: new Date(Date.now() - 60_000).toISOString(),
    });
    const vigente = servicioValido({ solicitud_expira_en: enDosHoras() });
    await insertar(bd, 'reservas.servicios', vencida);
    await insertar(bd, 'reservas.servicios', vigente);

    const { rows } = await bd.query(
      `select id from reservas.servicios where estado = 'solicitado' and solicitud_expira_en < now() and id = any($1)`,
      [[vencida.id, vigente.id]],
    );
    expect(rows.map((f) => f.id)).toEqual([vencida.id]);
  });
});
