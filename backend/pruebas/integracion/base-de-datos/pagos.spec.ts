import {
  CHECK,
  FORANEA,
  SOLO_INSERCION,
  UNICA,
  conectarBd,
  insertar,
  nuevoId,
  pagoValido,
  rechazo,
} from '../../soporte/bd.js';

describe('esquema pagos', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  describe('política de precios (dato de referencia)', () => {
    it('la versión 1 viene cargada: 8 % a la familia y 10 % al profesional', async () => {
      const { rows } = await bd.query(
        `select comision_familia_bps, comision_profesional_bps from pagos.politicas_de_precios where version = 1`,
      );
      expect(rows[0]).toEqual({
        comision_familia_bps: 800,
        comision_profesional_bps: 1000,
      });
    });

    it('rechaza comisiones fuera de 0–100 %', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'pagos.politicas_de_precios', {
          version: 900,
          comision_familia_bps: 10_001,
          comision_profesional_bps: 1000,
          vigente_desde: new Date().toISOString(),
        }),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'politicas_comisiones_validas',
      });
    });

    it('no hay paquetes de bolsa hasta que el equipo empresarial los apruebe', async () => {
      const { rows } = await bd.query(
        `select count(*)::int as total from pagos.paquetes_de_bolsa`,
      );
      expect(rows[0]?.total).toBe(0);
    });
  });

  describe('paquetes de bolsa', () => {
    const paquete = (extra: Record<string, unknown> = {}) => ({
      codigo: `p-${nuevoId().slice(0, 8)}`,
      horas_referencia: 10,
      descuento_bps: 500,
      credito: 216_000,
      precio: 205_200,
      ...extra,
    });

    it('acepta un paquete con descuento', async () => {
      await insertar(bd, 'pagos.paquetes_de_bolsa', paquete());
    });

    it('rechaza un precio mayor que el crédito (sería un recargo, no un descuento)', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'pagos.paquetes_de_bolsa', paquete({ precio: 300_000 })),
      );
      expect(r.restriccion).toBe('paquetes_precio_valido');
    });

    it('rechaza un descuento superior al 100 %', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'pagos.paquetes_de_bolsa',
          paquete({ descuento_bps: 10_001 }),
        ),
      );
      expect(r.restriccion).toBe('paquetes_descuento_valido');
    });
  });

  describe('pagos (E3: 0 cobros duplicados)', () => {
    it('acepta el pago del servicio de $20.000 por 1 hora: total 21.600, profesional 18.000, plataforma 3.600', async () => {
      await insertar(bd, 'pagos.pagos', pagoValido());
    });

    it('la misma llave de idempotencia del mismo pagador no crea un segundo pago', async () => {
      const primero = pagoValido();
      await insertar(bd, 'pagos.pagos', primero);

      const r = await rechazo(() =>
        insertar(
          bd,
          'pagos.pagos',
          pagoValido({
            pagador_id: primero.pagador_id,
            clave_idempotencia: primero.clave_idempotencia,
          }),
        ),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'pagos_idempotencia_unica',
      });
    });

    it('la misma llave usada por OTRO pagador es un pago distinto', async () => {
      const primero = pagoValido();
      await insertar(bd, 'pagos.pagos', primero);
      await insertar(
        bd,
        'pagos.pagos',
        pagoValido({ clave_idempotencia: primero.clave_idempotencia }),
      );
    });

    it('dos pagos no pueden tener la misma referencia de la pasarela', async () => {
      const referencia = {
        proveedor: 'wompi',
        referencia_proveedor: `ref-${nuevoId()}`,
      };
      await insertar(bd, 'pagos.pagos', pagoValido(referencia));

      const r = await rechazo(() =>
        insertar(bd, 'pagos.pagos', pagoValido(referencia)),
      );
      expect(r.restriccion).toBe('pagos_referencia_proveedor_unica');
    });

    it('E10: el ingreso de la plataforma debe ser total menos pago al profesional', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'pagos.pagos', pagoValido({ ingreso_plataforma: 5000 })),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'pagos_desglose_de_servicio_coherente',
      });
    });

    it.each([
      ['sin pago al profesional', { pago_profesional: null }],
      ['sin ingreso de la plataforma', { ingreso_plataforma: null }],
      ['sin versión de política', { politica_version: null }],
      [
        'con pago al profesional negativo',
        { pago_profesional: -1, ingreso_plataforma: 21_601 },
      ],
    ])('un pago de servicio %s es inválido', async (_nombre, extra) => {
      const r = await rechazo(() =>
        insertar(bd, 'pagos.pagos', pagoValido(extra)),
      );
      expect(r.restriccion).toBe('pagos_desglose_de_servicio_coherente');
    });

    it('un pago de servicio debe apuntar a un servicio, y uno de bolsa a un paquete', async () => {
      const servicioSinId = await rechazo(() =>
        insertar(bd, 'pagos.pagos', pagoValido({ servicio_id: null })),
      );
      const bolsaSinPaquete = await rechazo(() =>
        insertar(bd, 'pagos.pagos', {
          id: nuevoId(),
          concepto: 'bolsa',
          pagador_id: nuevoId(),
          medio: 'pasarela',
          monto_total: 205_200,
          clave_idempotencia: nuevoId(),
        }),
      );
      expect(servicioSinId.restriccion).toBe('pagos_concepto_coherente');
      expect(bolsaSinPaquete.restriccion).toBe('pagos_concepto_coherente');
    });

    it('rechaza un paquete de bolsa inexistente', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'pagos.pagos', {
          id: nuevoId(),
          concepto: 'bolsa',
          paquete_codigo: 'no-existe',
          pagador_id: nuevoId(),
          medio: 'pasarela',
          monto_total: 100_000,
          clave_idempotencia: nuevoId(),
        }),
      );
      expect(r.codigo).toBe(FORANEA);
    });

    it('rechaza una política de precios inexistente', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'pagos.pagos', pagoValido({ politica_version: 9999 })),
      );
      expect(r.codigo).toBe(FORANEA);
    });

    it.each([
      [
        'monto en cero',
        { monto_total: 0, pago_profesional: 0, ingreso_plataforma: 0 },
        'pagos_monto_valido',
      ],
      ['una moneda distinta de COP', { moneda: 'USD' }, 'pagos_moneda_valida'],
      ['un estado desconocido', { estado: 'quizas' }, 'pagos_estado_valido'],
      ['un medio desconocido', { medio: 'efectivo' }, 'pagos_medio_valido'],
      [
        'aprobado sin fecha de aprobación',
        { estado: 'aprobado' },
        'pagos_aprobacion_con_fecha',
      ],
    ])('rechaza un pago con %s', async (_nombre, extra, restriccion) => {
      const r = await rechazo(() =>
        insertar(bd, 'pagos.pagos', pagoValido(extra)),
      );
      expect(r.restriccion).toBe(restriccion);
    });
  });

  describe('avisos de la pasarela (webhooks)', () => {
    const aviso = (extra: Record<string, unknown> = {}) => ({
      id: nuevoId(),
      proveedor: 'wompi',
      id_evento_externo: `evt-${nuevoId()}`,
      tipo: 'transaction.updated',
      cuerpo: JSON.stringify({ estado: 'APPROVED' }),
      firma_valida: true,
      ...extra,
    });

    it('el mismo aviso de la pasarela se registra una sola vez', async () => {
      const primero = aviso();
      await insertar(bd, 'pagos.eventos_de_pasarela', primero);

      const r = await rechazo(() =>
        insertar(
          bd,
          'pagos.eventos_de_pasarela',
          aviso({ id_evento_externo: primero.id_evento_externo }),
        ),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'eventos_pasarela_unico',
      });
    });

    it('el mismo id externo de otro proveedor es un aviso distinto', async () => {
      const primero = aviso();
      await insertar(bd, 'pagos.eventos_de_pasarela', primero);
      await insertar(
        bd,
        'pagos.eventos_de_pasarela',
        aviso({
          proveedor: 'epayco',
          id_evento_externo: primero.id_evento_externo,
        }),
      );
    });

    it('un aviso puede llegar antes de conocer el pago (pago_id nulo), pero no apuntar a uno inexistente', async () => {
      await insertar(bd, 'pagos.eventos_de_pasarela', aviso());
      const r = await rechazo(() =>
        insertar(
          bd,
          'pagos.eventos_de_pasarela',
          aviso({ pago_id: nuevoId() }),
        ),
      );
      expect(r.codigo).toBe(FORANEA);
    });
  });

  describe('bolsa de horas y su libro de movimientos', () => {
    async function bolsa(extra: Record<string, unknown> = {}) {
      const fila = {
        id: nuevoId(),
        familiar_id: nuevoId(),
        saldo_disponible: 0,
        saldo_reservado: 0,
        ...extra,
      };
      await insertar(bd, 'pagos.bolsas', fila);
      return fila;
    }

    // Un pago de bolsa pagado, para poder registrar el movimiento de compra.
    async function pagoDeBolsa(): Promise<string> {
      const codigo = `p-${nuevoId().slice(0, 8)}`;
      await insertar(bd, 'pagos.paquetes_de_bolsa', {
        codigo,
        horas_referencia: 10,
        descuento_bps: 500,
        credito: 216_000,
        precio: 205_200,
      });
      const id = nuevoId();
      await insertar(bd, 'pagos.pagos', {
        id,
        concepto: 'bolsa',
        paquete_codigo: codigo,
        pagador_id: nuevoId(),
        medio: 'pasarela',
        monto_total: 205_200,
        clave_idempotencia: nuevoId(),
      });
      return id;
    }

    const movimiento = (
      bolsaId: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      bolsa_id: bolsaId,
      tipo: 'reserva',
      delta_disponible: -21_600,
      delta_reservado: 21_600,
      servicio_id: nuevoId(),
      ...extra,
    });

    it('una familia solo puede tener una bolsa', async () => {
      const primera = await bolsa();
      const r = await rechazo(() =>
        bolsa({ familiar_id: primera.familiar_id }),
      );
      expect(r.restriccion).toBe('bolsas_familiar_unica');
    });

    it('NUNCA admite un saldo negativo, aunque falle el código', async () => {
      const disponible = await rechazo(() => bolsa({ saldo_disponible: -1 }));
      const reservado = await rechazo(() => bolsa({ saldo_reservado: -1 }));
      const alGastar = await bolsa({ saldo_disponible: 10_000 });
      const sobregiro = await rechazo(() =>
        bd.query(
          `update pagos.bolsas set saldo_disponible = saldo_disponible - 20000 where id = $1`,
          [alGastar.id],
        ),
      );

      expect(disponible).toMatchObject({
        codigo: CHECK,
        restriccion: 'bolsas_saldos_no_negativos',
      });
      expect(reservado.restriccion).toBe('bolsas_saldos_no_negativos');
      expect(sobregiro.restriccion).toBe('bolsas_saldos_no_negativos');
    });

    it('registra una compra, una reserva, un consumo y una liberación con sus deltas correctos', async () => {
      const { id } = await bolsa();
      const pago = await pagoDeBolsa();

      await insertar(bd, 'pagos.movimientos_de_bolsa', {
        id: nuevoId(),
        bolsa_id: id,
        tipo: 'compra',
        delta_disponible: 216_000,
        delta_reservado: 0,
        pago_id: pago,
      });
      await insertar(bd, 'pagos.movimientos_de_bolsa', movimiento(id));
      await insertar(
        bd,
        'pagos.movimientos_de_bolsa',
        movimiento(id, {
          tipo: 'consumo',
          delta_disponible: 0,
          delta_reservado: -21_600,
        }),
      );
      await insertar(
        bd,
        'pagos.movimientos_de_bolsa',
        movimiento(id, {
          tipo: 'liberacion',
          delta_disponible: 21_600,
          delta_reservado: -21_600,
        }),
      );
      await insertar(bd, 'pagos.movimientos_de_bolsa', {
        id: nuevoId(),
        bolsa_id: id,
        tipo: 'ajuste',
        delta_disponible: -1000,
        delta_reservado: 0,
      });
    });

    it.each([
      [
        'una compra que resta saldo',
        {
          tipo: 'compra',
          delta_disponible: -100,
          delta_reservado: 0,
          pago_id: 'x',
        },
      ],
      [
        'una compra que toca lo reservado',
        {
          tipo: 'compra',
          delta_disponible: 100,
          delta_reservado: 100,
          pago_id: 'x',
        },
      ],
      [
        'una reserva que no mueve lo mismo a reservado',
        { tipo: 'reserva', delta_disponible: -100, delta_reservado: 50 },
      ],
      [
        'una reserva que suma saldo',
        { tipo: 'reserva', delta_disponible: 100, delta_reservado: -100 },
      ],
      [
        'un consumo que toca el saldo disponible',
        { tipo: 'consumo', delta_disponible: -100, delta_reservado: -100 },
      ],
      [
        'un consumo que suma a lo reservado',
        { tipo: 'consumo', delta_disponible: 0, delta_reservado: 100 },
      ],
      [
        'una liberación que no devuelve lo reservado',
        { tipo: 'liberacion', delta_disponible: 100, delta_reservado: -50 },
      ],
      [
        'un ajuste en cero',
        { tipo: 'ajuste', delta_disponible: 0, delta_reservado: 0 },
      ],
      [
        'un ajuste que toca lo reservado',
        { tipo: 'ajuste', delta_disponible: 100, delta_reservado: 100 },
      ],
      [
        'un tipo de movimiento desconocido',
        { tipo: 'regalo', delta_disponible: 100, delta_reservado: 0 },
      ],
    ])('rechaza %s', async (_nombre, extra) => {
      const { id } = await bolsa();
      const datos: Record<string, unknown> = { ...movimiento(id), ...extra };
      if (datos.pago_id === 'x') datos.pago_id = await pagoDeBolsa();

      const r = await rechazo(() =>
        insertar(bd, 'pagos.movimientos_de_bolsa', datos),
      );
      expect(r.codigo).toBe(CHECK);
    });

    it('una reserva, un consumo o una liberación exigen servicio; una compra exige pago', async () => {
      const { id } = await bolsa();
      const sinServicio = await rechazo(() =>
        insertar(
          bd,
          'pagos.movimientos_de_bolsa',
          movimiento(id, { servicio_id: null }),
        ),
      );
      const compraSinPago = await rechazo(() =>
        insertar(bd, 'pagos.movimientos_de_bolsa', {
          id: nuevoId(),
          bolsa_id: id,
          tipo: 'compra',
          delta_disponible: 100,
          delta_reservado: 0,
        }),
      );
      expect(sinServicio.restriccion).toBe('movimientos_servicio_requerido');
      expect(compraSinPago.restriccion).toBe('movimientos_pago_requerido');
    });

    it('reprocesar un evento no reserva dos veces el mismo servicio', async () => {
      const { id } = await bolsa();
      const primero = movimiento(id);
      await insertar(bd, 'pagos.movimientos_de_bolsa', primero);

      const r = await rechazo(() =>
        insertar(
          bd,
          'pagos.movimientos_de_bolsa',
          movimiento(id, { servicio_id: primero.servicio_id }),
        ),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'movimientos_servicio_unico',
      });
    });

    it('el mismo servicio sí admite un consumo después de su reserva', async () => {
      const { id } = await bolsa();
      const reserva = movimiento(id);
      await insertar(bd, 'pagos.movimientos_de_bolsa', reserva);
      await insertar(
        bd,
        'pagos.movimientos_de_bolsa',
        movimiento(id, {
          tipo: 'consumo',
          delta_disponible: 0,
          delta_reservado: -21_600,
          servicio_id: reserva.servicio_id,
        }),
      );
    });

    it('el libro es de solo inserción: no se edita ni se borra un movimiento', async () => {
      const { id } = await bolsa();
      const fila = movimiento(id);
      await insertar(bd, 'pagos.movimientos_de_bolsa', fila);

      const editar = await rechazo(() =>
        bd.query(
          `update pagos.movimientos_de_bolsa set delta_disponible = -1 where id = $1`,
          [fila.id],
        ),
      );
      const borrar = await rechazo(() =>
        bd.query(`delete from pagos.movimientos_de_bolsa where id = $1`, [
          fila.id,
        ]),
      );

      expect(editar.codigo).toBe(SOLO_INSERCION);
      expect(borrar.codigo).toBe(SOLO_INSERCION);
    });
  });

  describe('liquidaciones', () => {
    const liquidacion = (extra: Record<string, unknown> = {}) => ({
      id: nuevoId(),
      cuidador_id: nuevoId(),
      servicio_id: nuevoId(),
      monto: 18_000,
      ...extra,
    });

    it('un servicio se liquida una sola vez (reprocesar el evento no paga dos veces)', async () => {
      const primera = liquidacion();
      await insertar(bd, 'pagos.liquidaciones', primera);

      const r = await rechazo(() =>
        insertar(
          bd,
          'pagos.liquidaciones',
          liquidacion({ servicio_id: primera.servicio_id }),
        ),
      );
      expect(r.restriccion).toBe('liquidaciones_servicio_unica');
    });

    it('rechaza un monto en cero y una liquidación pagada sin fecha de pago', async () => {
      const monto = await rechazo(() =>
        insertar(bd, 'pagos.liquidaciones', liquidacion({ monto: 0 })),
      );
      const sinFecha = await rechazo(() =>
        insertar(bd, 'pagos.liquidaciones', liquidacion({ estado: 'pagada' })),
      );
      expect(monto.restriccion).toBe('liquidaciones_monto_valido');
      expect(sinFecha.restriccion).toBe('liquidaciones_pago_con_fecha');
    });
  });

  it('solo hay una conciliación por día', async () => {
    const dia = {
      fecha: '2026-12-01',
      total_pasarela: 100,
      total_interno: 100,
    };
    await insertar(bd, 'pagos.conciliaciones', { id: nuevoId(), ...dia });

    const r = await rechazo(() =>
      insertar(bd, 'pagos.conciliaciones', { id: nuevoId(), ...dia }),
    );
    expect(r.restriccion).toBe('conciliaciones_fecha_unica');
  });
});
