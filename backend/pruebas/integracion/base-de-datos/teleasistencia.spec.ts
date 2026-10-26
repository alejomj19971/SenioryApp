import {
  CHECK,
  FORANEA,
  UNICA,
  conectarBd,
  insertar,
  lecturaValida,
  medicamentoValido,
  nuevoId,
  rechazo,
} from '../../soporte/bd.js';

describe('esquema teleasistencia', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  describe('medicamentos y horarios', () => {
    it('acepta un medicamento que se toma todos los días', async () => {
      await insertar(bd, 'teleasistencia.medicamentos', medicamentoValido());
    });

    it.each([
      ['sin ningún día', { dias_semana: [] }],
      ['con un día que no existe (8)', { dias_semana: [1, 8] }],
      ['con el día cero', { dias_semana: [0] }],
    ])('rechaza un medicamento %s', async (_nombre, extra) => {
      const r = await rechazo(() =>
        insertar(bd, 'teleasistencia.medicamentos', medicamentoValido(extra)),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'medicamentos_dias_validos',
      });
    });

    it('rechaza una vigencia que termina antes de empezar', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.medicamentos',
          medicamentoValido({
            vigente_desde: '2026-10-10',
            vigente_hasta: '2026-10-01',
          }),
        ),
      );
      expect(r.restriccion).toBe('medicamentos_vigencia_valida');
    });

    it('rechaza un nombre o una dosis vacíos', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.medicamentos',
          medicamentoValido({ dosis: '' }),
        ),
      );
      expect(r.restriccion).toBe('medicamentos_nombre_valido');
    });

    it('un medicamento no repite el mismo horario, pero admite varios distintos', async () => {
      const m = medicamentoValido();
      await insertar(bd, 'teleasistencia.medicamentos', m);
      await insertar(bd, 'teleasistencia.horarios_de_medicamento', {
        id: nuevoId(),
        medicamento_id: m.id,
        hora: '08:00',
      });
      await insertar(bd, 'teleasistencia.horarios_de_medicamento', {
        id: nuevoId(),
        medicamento_id: m.id,
        hora: '20:00',
      });

      const r = await rechazo(() =>
        insertar(bd, 'teleasistencia.horarios_de_medicamento', {
          id: nuevoId(),
          medicamento_id: m.id,
          hora: '08:00',
        }),
      );
      expect(r.restriccion).toBe('horarios_medicamento_hora_unica');
    });

    it('al borrar un medicamento se borran sus horarios', async () => {
      const m = medicamentoValido();
      await insertar(bd, 'teleasistencia.medicamentos', m);
      await insertar(bd, 'teleasistencia.horarios_de_medicamento', {
        id: nuevoId(),
        medicamento_id: m.id,
        hora: '08:00',
      });

      await bd.query(`delete from teleasistencia.medicamentos where id = $1`, [
        m.id,
      ]);

      const { rows } = await bd.query(
        `select count(*)::int as total from teleasistencia.horarios_de_medicamento where medicamento_id = $1`,
        [m.id],
      );
      expect(rows[0]?.total).toBe(0);
    });
  });

  describe('tomas de medicamento', () => {
    const toma = (
      medicamentoId: string,
      adultoMayorId: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      medicamento_id: medicamentoId,
      adulto_mayor_id: adultoMayorId,
      fecha: '2026-11-10',
      hora_programada: '08:00',
      ...extra,
    });

    async function medicamento() {
      const m = medicamentoValido();
      await insertar(bd, 'teleasistencia.medicamentos', m);
      return m;
    }

    it('generar las tomas del día es idempotente: no se duplica la misma toma', async () => {
      const m = await medicamento();
      await insertar(bd, 'teleasistencia.tomas', toma(m.id, m.adulto_mayor_id));

      const r = await rechazo(() =>
        insertar(bd, 'teleasistencia.tomas', toma(m.id, m.adulto_mayor_id)),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'tomas_programada_unica',
      });
    });

    it('el mismo medicamento tiene una toma por cada día y por cada hora', async () => {
      const m = await medicamento();
      await insertar(bd, 'teleasistencia.tomas', toma(m.id, m.adulto_mayor_id));
      await insertar(
        bd,
        'teleasistencia.tomas',
        toma(m.id, m.adulto_mayor_id, { hora_programada: '20:00' }),
      );
      await insertar(
        bd,
        'teleasistencia.tomas',
        toma(m.id, m.adulto_mayor_id, { fecha: '2026-11-11' }),
      );
    });

    it('una toma marcada como tomada exige la fecha en que se registró', async () => {
      const m = await medicamento();
      const sinFecha = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.tomas',
          toma(m.id, m.adulto_mayor_id, { estado: 'tomada' }),
        ),
      );
      expect(sinFecha.restriccion).toBe('tomas_tomada_con_fecha');

      await insertar(
        bd,
        'teleasistencia.tomas',
        toma(m.id, m.adulto_mayor_id, {
          estado: 'tomada',
          registrada_por: nuevoId(),
          registrada_en: new Date().toISOString(),
        }),
      );
    });

    it('se puede deshacer una toma (volver a pendiente), a diferencia de la auditoría', async () => {
      const m = await medicamento();
      const t = toma(m.id, m.adulto_mayor_id, {
        estado: 'tomada',
        registrada_en: new Date().toISOString(),
      });
      await insertar(bd, 'teleasistencia.tomas', t);

      await bd.query(
        `update teleasistencia.tomas set estado = 'pendiente', registrada_en = null where id = $1`,
        [t.id],
      );
    });

    it('rechaza un estado desconocido y una toma de un medicamento inexistente', async () => {
      const m = await medicamento();
      const estado = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.tomas',
          toma(m.id, m.adulto_mayor_id, { estado: 'olvidada' }),
        ),
      );
      const huerfana = await rechazo(() =>
        insertar(bd, 'teleasistencia.tomas', toma(nuevoId(), nuevoId())),
      );
      expect(estado.restriccion).toBe('tomas_estado_valido');
      expect(huerfana.codigo).toBe(FORANEA);
    });
  });

  describe('signos vitales', () => {
    it('acepta una lectura completa', async () => {
      await insertar(bd, 'teleasistencia.lecturas_signos', lecturaValida());
    });

    it('acepta lecturas parciales: solo glucosa, solo frecuencia o solo presión (hallazgo H8)', async () => {
      const soloGlucosa = {
        presion_sistolica: null,
        presion_diastolica: null,
        frecuencia_cardiaca: null,
      };
      const soloFrecuencia = {
        presion_sistolica: null,
        presion_diastolica: null,
        glucosa: null,
      };
      const soloPresion = { frecuencia_cardiaca: null, glucosa: null };

      await insertar(
        bd,
        'teleasistencia.lecturas_signos',
        lecturaValida(soloGlucosa),
      );
      await insertar(
        bd,
        'teleasistencia.lecturas_signos',
        lecturaValida(soloFrecuencia),
      );
      await insertar(
        bd,
        'teleasistencia.lecturas_signos',
        lecturaValida(soloPresion),
      );
    });

    it('rechaza una lectura sin ninguna medida', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.lecturas_signos',
          lecturaValida({
            presion_sistolica: null,
            presion_diastolica: null,
            frecuencia_cardiaca: null,
            glucosa: null,
          }),
        ),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'lecturas_con_alguna_medida',
      });
    });

    it('la presión se registra completa: sistólica y diastólica van juntas', async () => {
      const soloSistolica = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.lecturas_signos',
          lecturaValida({ presion_diastolica: null }),
        ),
      );
      const soloDiastolica = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.lecturas_signos',
          lecturaValida({ presion_sistolica: null }),
        ),
      );
      expect(soloSistolica.restriccion).toBe('lecturas_presion_completa');
      expect(soloDiastolica.restriccion).toBe('lecturas_presion_completa');
    });

    it('la diastólica debe ser menor que la sistólica', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.lecturas_signos',
          lecturaValida({ presion_sistolica: 80, presion_diastolica: 90 }),
        ),
      );
      expect(r.restriccion).toBe('lecturas_presion_coherente');
    });

    it.each([
      ['presión sistólica 300', { presion_sistolica: 300 }],
      [
        'presión sistólica 40',
        { presion_sistolica: 40, presion_diastolica: 30 },
      ],
      ['presión diastólica 20', { presion_diastolica: 20 }],
      ['frecuencia cardiaca 10', { frecuencia_cardiaca: 10 }],
      ['frecuencia cardiaca 300', { frecuencia_cardiaca: 300 }],
      ['glucosa 10', { glucosa: 10 }],
      ['glucosa 700', { glucosa: 700 }],
    ])(
      'rechaza una medida imposible (error de digitación): %s',
      async (_nombre, extra) => {
        const r = await rechazo(() =>
          insertar(bd, 'teleasistencia.lecturas_signos', lecturaValida(extra)),
        );
        expect(r.restriccion).toBe('lecturas_rangos_plausibles');
      },
    );

    it('acepta valores altos pero posibles (hipertensión, hiperglucemia): la base no hace de médico', async () => {
      await insertar(
        bd,
        'teleasistencia.lecturas_signos',
        lecturaValida({
          presion_sistolica: 185,
          presion_diastolica: 110,
          glucosa: 320,
          fuera_de_rango: true,
        }),
      );
    });

    it('rechaza una fuente desconocida', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.lecturas_signos',
          lecturaValida({ fuente: 'adivinada' }),
        ),
      );
      expect(r.restriccion).toBe('lecturas_fuente_valida');
    });

    it('las últimas lecturas de una persona salen de la más reciente a la más antigua', async () => {
      const persona = nuevoId();
      for (let dia = 1; dia <= 7; dia++) {
        await insertar(
          bd,
          'teleasistencia.lecturas_signos',
          lecturaValida({
            adulto_mayor_id: persona,
            tomada_en: new Date(Date.UTC(2026, 9, dia, 15)).toISOString(),
            glucosa: 90 + dia,
          }),
        );
      }

      const { rows } = await bd.query(
        `select glucosa from teleasistencia.lecturas_signos where adulto_mayor_id = $1 order by tomada_en desc limit 3`,
        [persona],
      );
      expect(rows.map((f) => f.glucosa)).toEqual([97, 96, 95]);
    });
  });

  describe('rangos de referencia', () => {
    const rango = (extra: Record<string, unknown> = {}) => ({
      adulto_mayor_id: nuevoId(),
      sistolica_min: 90,
      sistolica_max: 140,
      definidos_por: nuevoId(),
      ...extra,
    });

    it('acepta rangos con mínimo menor que máximo, y rangos parciales', async () => {
      await insertar(bd, 'teleasistencia.rangos_de_referencia', rango());
      await insertar(
        bd,
        'teleasistencia.rangos_de_referencia',
        rango({ sistolica_min: null, sistolica_max: null, glucosa_max: 180 }),
      );
    });

    it.each([
      ['mínimo mayor que máximo', { sistolica_min: 150, sistolica_max: 140 }],
      ['mínimo igual al máximo', { sistolica_min: 120, sistolica_max: 120 }],
      [
        'glucosa con mínimo mayor que máximo',
        { glucosa_min: 200, glucosa_max: 100 },
      ],
    ])('rechaza %s', async (_nombre, extra) => {
      const r = await rechazo(() =>
        insertar(bd, 'teleasistencia.rangos_de_referencia', rango(extra)),
      );
      expect(r.restriccion).toBe('rangos_minimos_menores_que_maximos');
    });

    it('cada persona tiene un solo conjunto de rangos', async () => {
      const primero = rango();
      await insertar(bd, 'teleasistencia.rangos_de_referencia', primero);

      const r = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.rangos_de_referencia',
          rango({ adulto_mayor_id: primero.adulto_mayor_id }),
        ),
      );
      expect(r.codigo).toBe(UNICA);
    });
  });

  describe('alertas (E11 y hallazgo H7)', () => {
    const alerta = (extra: Record<string, unknown> = {}) => ({
      id: nuevoId(),
      adulto_mayor_id: nuevoId(),
      origen: 'boton',
      generada_por: nuevoId(),
      clave_idempotencia: nuevoId(),
      ...extra,
    });

    it('un reintento por mala conexión (misma llave) no crea una segunda alerta', async () => {
      const primera = alerta();
      await insertar(bd, 'teleasistencia.alertas', primera);

      const r = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.alertas',
          alerta({
            generada_por: primera.generada_por,
            clave_idempotencia: primera.clave_idempotencia,
          }),
        ),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'alertas_idempotencia_unica',
      });
    });

    it('CONCURRENCIA: el botón se envía dos veces a la vez → queda una sola alerta', async () => {
      const mismaAlerta = {
        generada_por: nuevoId(),
        clave_idempotencia: nuevoId(),
        adulto_mayor_id: nuevoId(),
      };

      const resultados = await Promise.allSettled([
        insertar(bd, 'teleasistencia.alertas', alerta(mismaAlerta)),
        insertar(bd, 'teleasistencia.alertas', alerta(mismaAlerta)),
      ]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
        1,
      );
      const { rows } = await bd.query(
        `select count(*)::int as total from teleasistencia.alertas where generada_por = $1 and clave_idempotencia = $2`,
        [mismaAlerta.generada_por, mismaAlerta.clave_idempotencia],
      );
      expect(rows[0]?.total).toBe(1);
    });

    it.each(['boton', 'voz', 'signos', 'medicamento'])(
      'acepta el origen %s',
      async (origen) => {
        await insertar(bd, 'teleasistencia.alertas', alerta({ origen }));
      },
    );

    it('rechaza un origen o un estado desconocidos', async () => {
      const origen = await rechazo(() =>
        insertar(bd, 'teleasistencia.alertas', alerta({ origen: 'telepatia' })),
      );
      const estado = await rechazo(() =>
        insertar(bd, 'teleasistencia.alertas', alerta({ estado: 'ignorada' })),
      );
      expect(origen.restriccion).toBe('alertas_origen_valido');
      expect(estado.restriccion).toBe('alertas_estado_valido');
    });

    it('una alerta atendida debe decir quién y cuándo la atendió', async () => {
      const sinQuien = await rechazo(() =>
        insertar(bd, 'teleasistencia.alertas', alerta({ estado: 'atendida' })),
      );
      expect(sinQuien.restriccion).toBe('alertas_atencion_completa');

      await insertar(
        bd,
        'teleasistencia.alertas',
        alerta({
          estado: 'atendida',
          atendida_por: nuevoId(),
          atendida_en: new Date().toISOString(),
        }),
      );
    });

    it('E11: la entrega no puede ser anterior a la generación, y se puede medir el tiempo', async () => {
      const antes = await rechazo(() =>
        insertar(
          bd,
          'teleasistencia.alertas',
          alerta({
            generada_en: '2026-10-10T10:00:10Z',
            primera_entrega_en: '2026-10-10T10:00:00Z',
          }),
        ),
      );
      expect(antes.restriccion).toBe('alertas_entrega_posterior');

      const rapida = alerta({
        generada_en: '2026-10-10T10:00:00Z',
        primera_entrega_en: '2026-10-10T10:00:04Z',
      });
      await insertar(bd, 'teleasistencia.alertas', rapida);
      const { rows } = await bd.query(
        `select extract(epoch from (primera_entrega_en - generada_en))::int as segundos from teleasistencia.alertas where id = $1`,
        [rapida.id],
      );
      expect(rows[0]?.segundos).toBe(4);
    });
  });
});
