import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../src/compartido/dominio/errores.js';
import { ContextoTransaccional } from '../../../src/compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import {
  Bolsa,
  TIPOS_DE_MOVIMIENTO,
} from '../../../src/pagos/dominio/bolsa.js';
import type {
  BolsaId,
  LiquidacionId,
  MovimientoDeBolsaId,
  PagoId,
} from '../../../src/pagos/dominio/ids.js';
import {
  ESTADOS_DE_LIQUIDACION,
  Liquidacion,
} from '../../../src/pagos/dominio/liquidacion.js';
import {
  CONCEPTOS_DE_PAGO,
  ESTADOS_DE_PAGO,
  MEDIOS_DEL_PAGO,
  Pago,
} from '../../../src/pagos/dominio/pago.js';
import { RepositorioBolsasDrizzle } from '../../../src/pagos/infraestructura/salida/persistencia/repositorio-bolsas-drizzle.js';
import { RepositorioPagosDrizzle } from '../../../src/pagos/infraestructura/salida/persistencia/repositorio-pagos-drizzle.js';
import {
  RepositorioAvisosDePasarelaDrizzle,
  RepositorioLiquidacionesDrizzle,
  RepositorioPaquetesDrizzle,
} from '../../../src/pagos/infraestructura/salida/persistencia/repositorios-menores-drizzle.js';
import {
  CHECK,
  conectarDrizzle,
  nuevoId,
  rechazo,
  SOLO_INSERCION,
  UNICA,
} from '../../soporte/bd.js';

// Los repositorios de Pagos contra Postgres real, y las reglas que la base hace cumplir aunque el código falle. La
// base se comparte con las demás pruebas: cada prueba usa sus propias personas (no hay claves foráneas entre
// esquemas) y nunca depende de «todo lo que hay».
describe('repositorios de Pagos', () => {
  const { pool, bd } = conectarDrizzle();
  const contexto = new ContextoTransaccional(bd);
  const pagos = new RepositorioPagosDrizzle(contexto);
  const bolsas = new RepositorioBolsasDrizzle(contexto);
  const liquidaciones = new RepositorioLiquidacionesDrizzle(contexto);
  const avisos = new RepositorioAvisosDePasarelaDrizzle(contexto);
  const paquetes = new RepositorioPaquetesDrizzle(contexto);

  const AHORA = new Date('2030-06-10T15:00:00.000Z');

  afterAll(async () => {
    await pool.end();
  });

  const filas = async <T extends object>(
    texto: string,
    parametros: unknown[] = [],
  ) => (await pool.query<T>(texto, parametros)).rows;

  const pagoDeServicio = (
    cambios: Partial<{ pagador: string; ahora: Date }> = {},
  ) =>
    Pago.paraServicio({
      id: nuevoId() as PagoId,
      servicioId: nuevoId(),
      pagadorId: cambios.pagador ?? nuevoId(),
      medio: 'pasarela',
      montoTotal: 43_200,
      pagoProfesional: 36_000,
      politicaVersion: 1,
      ahora: cambios.ahora ?? AHORA,
    });

  const pagoDeBolsa = async (pagador = nuevoId()) => {
    const codigo = `prueba-rp-${nuevoId().slice(0, 12)}`;
    await pool.query(
      `insert into pagos.paquetes_de_bolsa (codigo, horas_referencia, descuento_bps, credito, precio, activo)
       values ($1, 5, 1000, 100000, 90000, true)`,
      [codigo],
    );
    return Pago.paraBolsa({
      id: nuevoId() as PagoId,
      paqueteCodigo: codigo,
      pagadorId: pagador,
      montoTotal: 90_000,
      claveDeIdempotencia: `clave-${nuevoId()}`,
      ahora: AHORA,
    });
  };

  // El libro referencia el pago de cada compra con una clave foránea: tiene que existir.
  const pagoGuardado = async (): Promise<string> => {
    const pago = await pagoDeBolsa();
    await pagos.guardar(pago);
    return pago.id;
  };

  async function definicionDelCheck(restriccion: string): Promise<string> {
    const [fila] = await filas<{ definicion: string }>(
      `select pg_get_constraintdef(c.oid) as definicion
       from pg_constraint c join pg_namespace n on n.oid = c.connamespace
       where n.nspname = 'pagos' and c.conname = $1`,
      [restriccion],
    );
    if (fila === undefined)
      throw new Error(`No existe el CHECK ${restriccion}`);
    return fila.definicion;
  }

  const literales = (definicion: string) =>
    [...definicion.matchAll(/'([^']+)'::text/g)]
      .map((m) => m[1] as string)
      .sort();

  // ─── Constantes del dominio y la base ──────────────────────────────────────────────────────
  describe('constantes del dominio y base de datos', () => {
    it.each([
      ['estados del pago', 'pagos_estado_valido', ESTADOS_DE_PAGO],
      ['conceptos del pago', 'pagos_concepto_valido', CONCEPTOS_DE_PAGO],
      ['medios del pago', 'pagos_medio_valido', MEDIOS_DEL_PAGO],
      [
        'estados de la liquidación',
        'liquidaciones_estado_valido',
        ESTADOS_DE_LIQUIDACION,
      ],
      [
        'tipos de movimiento de la bolsa',
        'movimientos_tipo_valido',
        TIPOS_DE_MOVIMIENTO,
      ],
    ] as const)(
      'los %s coinciden (%s)',
      async (_nombre, restriccion, constantes) => {
        expect(literales(await definicionDelCheck(restriccion))).toEqual(
          [...constantes].sort(),
        );
      },
    );
  });

  // ─── Pagos ─────────────────────────────────────────────────────────────────────────────────
  describe('RepositorioPagosDrizzle', () => {
    it('guarda el pago de un servicio con su desglose y lo devuelve igual', async () => {
      const pago = pagoDeServicio();

      await pagos.guardar(pago);
      const leido = await pagos.buscarPorId(pago.id);

      expect(leido).toMatchObject({
        id: pago.id,
        concepto: 'servicio',
        servicioId: pago.servicioId,
        paqueteCodigo: null,
        pagadorId: pago.pagadorId,
        medio: 'pasarela',
        montoTotal: 43_200,
        pagoProfesional: 36_000,
        ingresoPlataforma: 7_200,
        politicaVersion: 1,
        estado: 'pendiente',
        proveedor: null,
        referenciaProveedor: null,
        claveDeIdempotencia: `servicio:${pago.servicioId}`,
        version: 1,
      });
      expect(leido?.creadoEn).toEqual(AHORA);
    });

    it('guarda la compra de una bolsa', async () => {
      const pago = await pagoDeBolsa();

      await pagos.guardar(pago);

      expect(await pagos.buscarPorId(pago.id)).toMatchObject({
        concepto: 'bolsa',
        paqueteCodigo: pago.paqueteCodigo,
        servicioId: null,
        pagoProfesional: null,
        medio: 'pasarela',
      });
    });

    it('un pago que no existe es null', async () => {
      expect(await pagos.buscarPorId(nuevoId() as PagoId)).toBeNull();
      expect(
        await pagos.buscarPorClave(nuevoId(), 'clave-que-no-existe'),
      ).toBeNull();
      expect(await pagos.buscarPorServicioParaActualizar(nuevoId())).toBeNull();
    });

    it('la misma clave del mismo pagador no crea dos pagos', async () => {
      const pagador = nuevoId();
      const primero = await pagoDeBolsa(pagador);
      await pagos.guardar(primero);
      const repetido = Pago.paraBolsa({
        id: nuevoId() as PagoId,
        paqueteCodigo: primero.paqueteCodigo as string,
        pagadorId: pagador,
        montoTotal: 90_000,
        claveDeIdempotencia: primero.claveDeIdempotencia,
        ahora: AHORA,
      });

      await expect(pagos.guardar(repetido)).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'pago.clave_repetida',
      });
    });

    it('la misma clave de otro pagador sí es otro pago', async () => {
      const primero = await pagoDeBolsa();
      await pagos.guardar(primero);
      const deOtro = Pago.paraBolsa({
        id: nuevoId() as PagoId,
        paqueteCodigo: primero.paqueteCodigo as string,
        pagadorId: nuevoId(),
        montoTotal: 90_000,
        claveDeIdempotencia: primero.claveDeIdempotencia,
        ahora: AHORA,
      });

      await expect(pagos.guardar(deOtro)).resolves.toBeUndefined();
    });

    it('actualiza el estado y sube la versión', async () => {
      const pago = pagoDeServicio();
      await pagos.guardar(pago);
      const leido = (await pagos.buscarPorId(pago.id)) as Pago;

      leido.asociarReferencia('simulada', 'sim_1', AHORA);
      leido.aprobar(AHORA);
      await pagos.actualizar(leido);

      expect(await pagos.buscarPorId(pago.id)).toMatchObject({
        estado: 'aprobado',
        proveedor: 'simulada',
        referenciaProveedor: 'sim_1',
        aprobadoEn: AHORA,
        version: 3,
      });
    });

    it('dos cambios simultáneos no se pisan: el segundo recibe un conflicto', async () => {
      const pago = pagoDeServicio();
      await pagos.guardar(pago);
      const uno = (await pagos.buscarPorId(pago.id)) as Pago;
      const otro = (await pagos.buscarPorId(pago.id)) as Pago;
      uno.aprobar(AHORA);
      otro.rechazar(AHORA);

      await pagos.actualizar(uno);

      await expect(pagos.actualizar(otro)).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'pago.version_obsoleta',
      });
      expect((await pagos.buscarPorId(pago.id))?.estado).toBe('aprobado');
    });

    it('actualizar un pago que no existe es «no encontrado»', async () => {
      const pago = pagoDeServicio();

      await expect(pagos.actualizar(pago)).rejects.toMatchObject({
        constructor: RecursoNoEncontrado,
        codigo: 'pago.no_encontrado',
      });
    });

    it('el pago de un servicio se encuentra por su servicio', async () => {
      const pago = pagoDeServicio();
      await pagos.guardar(pago);

      const leido = await pagos.buscarPorServicioParaActualizar(
        pago.servicioId as string,
      );

      expect(leido?.id).toBe(pago.id);
    });

    it('los pagos de una persona salen del más reciente al más antiguo y solo los suyos', async () => {
      const pagador = nuevoId();
      const viejo = pagoDeServicio({
        pagador,
        ahora: new Date('2030-01-01T00:00:00.000Z'),
      });
      const nuevo = pagoDeServicio({
        pagador,
        ahora: new Date('2030-03-01T00:00:00.000Z'),
      });
      await pagos.guardar(viejo);
      await pagos.guardar(nuevo);
      await pagos.guardar(pagoDeServicio());

      const lista = await pagos.listarDePagador(pagador, 10);

      expect(lista.map((p) => p.id)).toEqual([nuevo.id, viejo.id]);
      expect(await pagos.listarDePagador(pagador, 1)).toHaveLength(1);
    });

    it('lista los pendientes que pasaron su plazo y solo esos', async () => {
      const antiguo = pagoDeServicio({
        ahora: new Date('2001-01-01T00:00:00.000Z'),
      });
      const reciente = pagoDeServicio({
        ahora: new Date('2003-01-01T00:00:00.000Z'),
      });
      const yaAprobado = pagoDeServicio({
        ahora: new Date('2001-02-01T00:00:00.000Z'),
      });
      for (const pago of [antiguo, reciente, yaAprobado])
        await pagos.guardar(pago);
      const aprobado = (await pagos.buscarPorId(yaAprobado.id)) as Pago;
      aprobado.aprobar(AHORA);
      await pagos.actualizar(aprobado);

      const vencidos = await pagos.listarPendientesVencidos(
        new Date('2002-01-01T00:00:00.000Z'),
        10_000,
      );

      expect(vencidos).toContain(antiguo.id);
      expect(vencidos).not.toContain(reciente.id);
      expect(vencidos).not.toContain(yaAprobado.id);
    });

    describe('lo que la base hace cumplir', () => {
      const insertar = (cambios: Record<string, unknown>) => {
        const valores = {
          id: nuevoId(),
          concepto: 'servicio',
          servicio_id: nuevoId(),
          paquete_codigo: null,
          pagador_id: nuevoId(),
          medio: 'pasarela',
          monto_total: 43_200,
          pago_profesional: 36_000,
          ingreso_plataforma: 7_200,
          politica_version: 1,
          estado: 'pendiente',
          clave_idempotencia: `clave-${nuevoId()}`,
          aprobado_en: null,
          ...cambios,
        };
        return pool.query(
          `insert into pagos.pagos (id, concepto, servicio_id, paquete_codigo, pagador_id, medio, monto_total,
             pago_profesional, ingreso_plataforma, politica_version, estado, clave_idempotencia, aprobado_en)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          Object.values(valores),
        );
      };

      it.each([
        [
          'un servicio sin servicio',
          { servicio_id: null },
          'pagos_concepto_coherente',
        ],
        [
          'un monto en cero',
          { monto_total: 0, ingreso_plataforma: -36_000 },
          'pagos_monto_valido',
        ],
        [
          'un desglose que no suma',
          { ingreso_plataforma: 7_000 },
          'pagos_desglose_de_servicio_coherente',
        ],
        [
          'un servicio sin desglose',
          { pago_profesional: null, ingreso_plataforma: null },
          'pagos_desglose_de_servicio_coherente',
        ],
        ['un estado inventado', { estado: 'perdido' }, 'pagos_estado_valido'],
        [
          'un pago aprobado sin fecha',
          { estado: 'aprobado', aprobado_en: null },
          'pagos_aprobacion_con_fecha',
        ],
      ])('rechaza %s', async (_caso, cambios, restriccion) => {
        const r = await rechazo(() => insertar(cambios));

        expect(r.codigo).toBe(CHECK);
        expect(r.restriccion).toBe(restriccion);
      });

      it('rechaza pagar una bolsa con otra bolsa', async () => {
        const paquete = await pagoDeBolsa();
        const r = await rechazo(() =>
          insertar({
            concepto: 'bolsa',
            servicio_id: null,
            paquete_codigo: paquete.paqueteCodigo,
            medio: 'bolsa',
            pago_profesional: null,
            ingreso_plataforma: null,
            politica_version: null,
          }),
        );

        expect(r.restriccion).toBe('pagos_bolsa_se_paga_con_pasarela');
      });

      it('la referencia de la pasarela no se repite entre pagos', async () => {
        const referencia = `ref-${nuevoId()}`;
        const primero = pagoDeServicio();
        const segundo = pagoDeServicio();
        await pagos.guardar(primero);
        await pagos.guardar(segundo);
        await pool.query(
          "update pagos.pagos set proveedor = 'simulada', referencia_proveedor = $2 where id = $1",
          [primero.id, referencia],
        );

        const r = await rechazo(() =>
          pool.query(
            "update pagos.pagos set proveedor = 'simulada', referencia_proveedor = $2 where id = $1",
            [segundo.id, referencia],
          ),
        );

        expect(r.codigo).toBe(UNICA);
        expect(r.restriccion).toBe('pagos_referencia_proveedor_unica');
      });
    });
  });

  // ─── Bolsa y su libro ──────────────────────────────────────────────────────────────────────
  describe('RepositorioBolsasDrizzle', () => {
    const idBolsa = () => nuevoId() as BolsaId;
    const idMovimiento = () => nuevoId() as MovimientoDeBolsaId;

    // Abre la bolsa de una familia nueva con `saldo` ya acreditado.
    async function conSaldo(
      saldo: number,
      familiar = nuevoId(),
    ): Promise<Bolsa> {
      const pagoReal = await pagoGuardado();
      return contexto.ejecutar(async () => {
        const bolsa = await bolsas.obtenerOCrearParaActualizar(
          familiar,
          idBolsa(),
          AHORA,
        );
        if (saldo > 0) {
          bolsa.acreditar(saldo, pagoReal, idMovimiento(), AHORA);
          await bolsas.guardar(bolsa);
        }
        return bolsa;
      });
    }

    it('abre la bolsa de una familia la primera vez, en cero, y después devuelve la misma', async () => {
      const familiar = nuevoId();

      const primera = await contexto.ejecutar(() =>
        bolsas.obtenerOCrearParaActualizar(familiar, idBolsa(), AHORA),
      );
      const segunda = await contexto.ejecutar(() =>
        bolsas.obtenerOCrearParaActualizar(familiar, idBolsa(), AHORA),
      );

      expect(primera).toMatchObject({
        saldoDisponible: 0,
        saldoReservado: 0,
        version: 1,
      });
      expect(segunda.id).toBe(primera.id);
    });

    it('dos aperturas simultáneas de la bolsa de la misma familia crean una sola', async () => {
      const familiar = nuevoId();

      const bolsasAbiertas = await Promise.all(
        Array.from({ length: 5 }, () =>
          contexto.ejecutar(() =>
            bolsas.obtenerOCrearParaActualizar(familiar, idBolsa(), AHORA),
          ),
        ),
      );

      expect(new Set(bolsasAbiertas.map((b) => b.id)).size).toBe(1);
      expect(
        await filas('select id from pagos.bolsas where familiar_id = $1', [
          familiar,
        ]),
      ).toHaveLength(1);
    });

    it('buscar por familia no abre la bolsa', async () => {
      const familiar = nuevoId();

      expect(await bolsas.buscarPorFamiliar(familiar)).toBeNull();
      expect(
        await filas('select id from pagos.bolsas where familiar_id = $1', [
          familiar,
        ]),
      ).toEqual([]);
    });

    it('guarda el saldo y los movimientos en la misma operación', async () => {
      const familiar = nuevoId();
      const servicio = nuevoId();
      await conSaldo(100_000, familiar);

      await contexto.ejecutar(async () => {
        const bolsa = await bolsas.obtenerOCrearParaActualizar(
          familiar,
          idBolsa(),
          AHORA,
        );
        bolsa.reservar(43_200, servicio, idMovimiento(), AHORA);
        await bolsas.guardar(bolsa);
      });

      const leida = await bolsas.buscarPorFamiliar(familiar);
      expect(leida).toMatchObject({
        saldoDisponible: 56_800,
        saldoReservado: 43_200,
      });
      const movimientos = await bolsas.movimientosDelServicio(
        leida?.id as BolsaId,
        servicio,
      );
      expect(movimientos).toMatchObject([
        {
          tipo: 'reserva',
          deltaDisponible: -43_200,
          deltaReservado: 43_200,
          servicioId: servicio,
        },
      ]);
    });

    it('los últimos movimientos salen del más reciente al más antiguo', async () => {
      const familiar = nuevoId();
      const pagoReal = await pagoGuardado();
      const bolsa = await contexto.ejecutar(async () => {
        const nueva = await bolsas.obtenerOCrearParaActualizar(
          familiar,
          idBolsa(),
          AHORA,
        );
        nueva.acreditar(
          10_000,
          pagoReal,
          idMovimiento(),
          new Date('2030-01-01T00:00:00Z'),
        );
        nueva.acreditar(
          20_000,
          pagoReal,
          idMovimiento(),
          new Date('2030-02-01T00:00:00Z'),
        );
        nueva.acreditar(
          30_000,
          pagoReal,
          idMovimiento(),
          new Date('2030-03-01T00:00:00Z'),
        );
        await bolsas.guardar(nueva);
        return nueva;
      });

      const ultimos = await bolsas.ultimosMovimientos(bolsa.id, 2);

      expect(ultimos.map((m) => m.deltaDisponible)).toEqual([30_000, 20_000]);
    });

    it('no reserva dos veces el mismo servicio', async () => {
      const familiar = nuevoId();
      const servicio = nuevoId();
      await conSaldo(200_000, familiar);
      await contexto.ejecutar(async () => {
        const bolsa = await bolsas.obtenerOCrearParaActualizar(
          familiar,
          idBolsa(),
          AHORA,
        );
        bolsa.reservar(43_200, servicio, idMovimiento(), AHORA);
        await bolsas.guardar(bolsa);
      });

      await expect(
        contexto.ejecutar(async () => {
          const bolsa = await bolsas.obtenerOCrearParaActualizar(
            familiar,
            idBolsa(),
            AHORA,
          );
          bolsa.reservar(43_200, servicio, idMovimiento(), AHORA);
          await bolsas.guardar(bolsa);
        }),
      ).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'bolsa.movimiento_repetido',
      });
      expect((await bolsas.buscarPorFamiliar(familiar))?.saldoReservado).toBe(
        43_200,
      );
    });

    it('dos cambios simultáneos de la misma bolsa no se pisan', async () => {
      const familiar = nuevoId();
      await conSaldo(100_000, familiar);
      const uno = (await bolsas.buscarPorFamiliar(familiar)) as Bolsa;
      const otro = (await bolsas.buscarPorFamiliar(familiar)) as Bolsa;
      uno.reservar(10_000, nuevoId(), idMovimiento(), AHORA);
      otro.reservar(10_000, nuevoId(), idMovimiento(), AHORA);

      await bolsas.guardar(uno);

      await expect(bolsas.guardar(otro)).rejects.toMatchObject({
        constructor: ConflictoDeEstado,
        codigo: 'bolsa.version_obsoleta',
      });
      expect(await bolsas.buscarPorFamiliar(familiar)).toMatchObject({
        saldoDisponible: 90_000,
        saldoReservado: 10_000,
      });
    });

    it('con muchas reservas a la vez el saldo nunca queda negativo ni se gasta dos veces', async () => {
      const familiar = nuevoId();
      // Alcanza para 3 de las 8 reservas de 30.000.
      await conSaldo(100_000, familiar);

      const resultados = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          contexto.ejecutar(async () => {
            const bolsa = await bolsas.obtenerOCrearParaActualizar(
              familiar,
              idBolsa(),
              AHORA,
            );
            bolsa.reservar(30_000, nuevoId(), idMovimiento(), AHORA);
            await bolsas.guardar(bolsa);
          }),
        ),
      );

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
        3,
      );
      expect(await bolsas.buscarPorFamiliar(familiar)).toMatchObject({
        saldoDisponible: 10_000,
        saldoReservado: 90_000,
      });
    });

    it('el saldo del libro cuadra con el de la bolsa', async () => {
      const familiar = nuevoId();
      const servicio = nuevoId();
      const bolsa = await conSaldo(100_000, familiar);
      await contexto.ejecutar(async () => {
        const abierta = await bolsas.obtenerOCrearParaActualizar(
          familiar,
          idBolsa(),
          AHORA,
        );
        abierta.reservar(40_000, servicio, idMovimiento(), AHORA);
        await bolsas.guardar(abierta);
      });
      await contexto.ejecutar(async () => {
        const abierta = await bolsas.obtenerOCrearParaActualizar(
          familiar,
          idBolsa(),
          AHORA,
        );
        abierta.consumir(40_000, servicio, idMovimiento(), AHORA);
        await bolsas.guardar(abierta);
      });

      const [suma] = await filas<{ disponible: string; reservado: string }>(
        `select coalesce(sum(delta_disponible), 0)::text as disponible,
                coalesce(sum(delta_reservado), 0)::text as reservado
         from pagos.movimientos_de_bolsa where bolsa_id = $1`,
        [bolsa.id],
      );
      const actual = await bolsas.buscarPorFamiliar(familiar);

      expect(Number(suma?.disponible)).toBe(actual?.saldoDisponible);
      expect(Number(suma?.reservado)).toBe(actual?.saldoReservado);
      expect(actual).toMatchObject({
        saldoDisponible: 60_000,
        saldoReservado: 0,
      });
    });

    describe('lo que la base hace cumplir aunque el código falle', () => {
      it('un saldo negativo se rechaza', async () => {
        const bolsa = await conSaldo(1_000);

        const r = await rechazo(() =>
          pool.query(
            'update pagos.bolsas set saldo_disponible = -1 where id = $1',
            [bolsa.id],
          ),
        );

        expect(r.codigo).toBe(CHECK);
        expect(r.restriccion).toBe('bolsas_saldos_no_negativos');
      });

      it('el libro no se edita ni se borra', async () => {
        const bolsa = await conSaldo(1_000);

        const edicion = await rechazo(() =>
          pool.query(
            'update pagos.movimientos_de_bolsa set delta_disponible = 999999 where bolsa_id = $1',
            [bolsa.id],
          ),
        );
        const borrado = await rechazo(() =>
          pool.query(
            'delete from pagos.movimientos_de_bolsa where bolsa_id = $1',
            [bolsa.id],
          ),
        );

        expect(edicion.codigo).toBe(SOLO_INSERCION);
        expect(borrado.codigo).toBe(SOLO_INSERCION);
      });

      it.each([
        ['una compra que baja el saldo', 'compra', -100, 0],
        ['una reserva que no aparta lo que descuenta', 'reserva', -100, 50],
        ['un consumo que toca el disponible', 'consumo', -100, -100],
        [
          'una liberación que no devuelve lo que aparta',
          'liberacion',
          100,
          -50,
        ],
        ['un ajuste que toca el reservado', 'ajuste', 100, 100],
      ])('rechaza %s', async (_caso, tipo, disponible, reservado) => {
        const bolsa = await conSaldo(1_000);

        const r = await rechazo(() =>
          pool.query(
            `insert into pagos.movimientos_de_bolsa (id, bolsa_id, tipo, delta_disponible, delta_reservado, servicio_id, pago_id)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [nuevoId(), bolsa.id, tipo, disponible, reservado, nuevoId(), null],
          ),
        );

        expect(r.codigo).toBe(CHECK);
      });

      it('una reserva sin servicio y una compra sin pago se rechazan', async () => {
        const bolsa = await conSaldo(1_000);

        const sinServicio = await rechazo(() =>
          pool.query(
            `insert into pagos.movimientos_de_bolsa (id, bolsa_id, tipo, delta_disponible, delta_reservado)
             values ($1, $2, 'reserva', -100, 100)`,
            [nuevoId(), bolsa.id],
          ),
        );
        const sinPago = await rechazo(() =>
          pool.query(
            `insert into pagos.movimientos_de_bolsa (id, bolsa_id, tipo, delta_disponible, delta_reservado)
             values ($1, $2, 'compra', 100, 0)`,
            [nuevoId(), bolsa.id],
          ),
        );

        expect(sinServicio.restriccion).toBe('movimientos_servicio_requerido');
        expect(sinPago.restriccion).toBe('movimientos_pago_requerido');
      });
    });
  });

  // ─── Liquidaciones ─────────────────────────────────────────────────────────────────────────
  describe('RepositorioLiquidacionesDrizzle', () => {
    const nueva = (
      cambios: Partial<{
        cuidador: string;
        servicio: string;
        creada: Date;
      }> = {},
    ) =>
      Liquidacion.crear({
        id: nuevoId() as LiquidacionId,
        cuidadorId: cambios.cuidador ?? nuevoId(),
        servicioId: cambios.servicio ?? nuevoId(),
        monto: 36_000,
        ahora: cambios.creada ?? AHORA,
      });

    it('crea una liquidación por servicio y reconoce que ya existía', async () => {
      const servicio = nuevoId();
      const primera = nueva({ servicio });
      const repetida = nueva({ servicio });

      expect(await liquidaciones.crearSiNoExiste(primera)).toBe(true);
      expect(await liquidaciones.crearSiNoExiste(repetida)).toBe(false);

      expect(await liquidaciones.buscarPorServicio(servicio)).toMatchObject({
        id: primera.id,
        monto: 36_000,
        estado: 'pendiente',
        pagadaEn: null,
      });
    });

    it('dos intentos a la vez crean una sola', async () => {
      const servicio = nuevoId();

      const resultados = await Promise.all(
        Array.from({ length: 4 }, () =>
          liquidaciones.crearSiNoExiste(nueva({ servicio })),
        ),
      );

      expect(resultados.filter(Boolean)).toHaveLength(1);
    });

    it('guarda el pago y lo lee de vuelta', async () => {
      const liquidacion = nueva();
      await liquidaciones.crearSiNoExiste(liquidacion);
      const leida = (await liquidaciones.buscarPorServicio(
        liquidacion.servicioId,
      )) as Liquidacion;

      leida.registrarPago('ref-1', AHORA);
      await liquidaciones.actualizar(leida);

      expect(
        await liquidaciones.buscarPorServicio(liquidacion.servicioId),
      ).toMatchObject({
        estado: 'pagada',
        referenciaDispersion: 'ref-1',
        pagadaEn: AHORA,
      });
    });

    it('dos instancias a la vez no reclaman la misma liquidación', async () => {
      await liquidaciones.crearSiNoExiste(
        nueva({ creada: new Date('2001-01-01T00:00:00Z') }),
      );
      await liquidaciones.crearSiNoExiste(
        nueva({ creada: new Date('2001-01-02T00:00:00Z') }),
      );
      let soltar!: () => void;
      const espera = new Promise<void>((resolver) => {
        soltar = resolver;
      });

      // La primera instancia reclama una y la deja bloqueada hasta que termine la segunda.
      const primera = contexto.ejecutar(async () => {
        const reclamada = await liquidaciones.reclamarSiguientePendiente();
        await espera;
        return reclamada;
      });
      await new Promise((resolver) => setTimeout(resolver, 200));
      const segunda = await contexto.ejecutar(() =>
        liquidaciones.reclamarSiguientePendiente(),
      );
      soltar();
      const reclamadaPorLaPrimera = await primera;

      expect(reclamadaPorLaPrimera).not.toBeNull();
      expect(segunda).not.toBeNull();
      expect(segunda?.id).not.toBe(reclamadaPorLaPrimera?.id);
    });

    it('las liquidaciones de un cuidador salen de la más reciente a la más antigua', async () => {
      const cuidador = nuevoId();
      const antigua = nueva({
        cuidador,
        creada: new Date('2002-01-01T00:00:00Z'),
      });
      const pagada = nueva({
        cuidador,
        creada: new Date('2002-01-02T00:00:00Z'),
      });
      await liquidaciones.crearSiNoExiste(antigua);
      await liquidaciones.crearSiNoExiste(pagada);
      const aPagar = (await liquidaciones.buscarPorServicio(
        pagada.servicioId,
      )) as Liquidacion;
      aPagar.registrarPago('ref', AHORA);
      await liquidaciones.actualizar(aPagar);

      const lista = await liquidaciones.listarDeCuidador(cuidador, 10);

      expect(lista.map((l) => l.id)).toEqual([pagada.id, antigua.id]);
    });

    it('rechaza una liquidación pagada sin fecha de pago y un monto en cero', async () => {
      const sinFecha = await rechazo(() =>
        pool.query(
          `insert into pagos.liquidaciones (id, cuidador_id, servicio_id, monto, estado)
           values ($1, $2, $3, 100, 'pagada')`,
          [nuevoId(), nuevoId(), nuevoId()],
        ),
      );
      const enCero = await rechazo(() =>
        pool.query(
          `insert into pagos.liquidaciones (id, cuidador_id, servicio_id, monto) values ($1, $2, $3, 0)`,
          [nuevoId(), nuevoId(), nuevoId()],
        ),
      );

      expect(sinFecha.restriccion).toBe('liquidaciones_pago_con_fecha');
      expect(enCero.restriccion).toBe('liquidaciones_monto_valido');
    });
  });

  // ─── Avisos de la pasarela ─────────────────────────────────────────────────────────────────
  describe('RepositorioAvisosDePasarelaDrizzle', () => {
    const aviso = (
      cambios: Partial<{ idEventoExterno: string; proveedor: string }> = {},
    ) => ({
      id: nuevoId(),
      proveedor: cambios.proveedor ?? 'simulada',
      idEventoExterno: cambios.idEventoExterno ?? `evt-${nuevoId()}`,
      pagoId: null,
      tipo: 'aprobado',
      cuerpo: { monto: 100 },
      firmaValida: true,
      recibidoEn: AHORA,
    });

    it('registra un aviso una sola vez por proveedor e identificador', async () => {
      const idEventoExterno = `evt-${nuevoId()}`;

      expect(await avisos.registrar(aviso({ idEventoExterno }))).toBe(true);
      expect(await avisos.registrar(aviso({ idEventoExterno }))).toBe(false);
      // El mismo identificador de otro proveedor es otro aviso.
      expect(
        await avisos.registrar(aviso({ idEventoExterno, proveedor: 'otro' })),
      ).toBe(true);
    });

    it('marca el aviso como procesado', async () => {
      const registrado = aviso();
      await avisos.registrar(registrado);

      await avisos.marcarProcesado(registrado.id, AHORA);

      const [fila] = await filas<{ procesado_en: Date }>(
        'select procesado_en from pagos.eventos_de_pasarela where id = $1',
        [registrado.id],
      );
      expect(fila?.procesado_en).toEqual(AHORA);
    });
  });

  // ─── Paquetes ──────────────────────────────────────────────────────────────────────────────
  describe('RepositorioPaquetesDrizzle', () => {
    async function paquete(
      cambios: Partial<{ precio: number; activo: boolean }> = {},
    ) {
      const codigo = `prueba-rq-${nuevoId().slice(0, 12)}`;
      await pool.query(
        `insert into pagos.paquetes_de_bolsa (codigo, horas_referencia, descuento_bps, credito, precio, activo)
         values ($1, 5, 500, 200000, $2, $3)`,
        [codigo, cambios.precio ?? 190_000, cambios.activo ?? true],
      );
      return codigo;
    }

    it('lista solo los activos, del más barato al más caro', async () => {
      const caro = await paquete({ precio: 199_000 });
      const barato = await paquete({ precio: 150_000 });
      const apagado = await paquete({ activo: false });

      const codigos = (await paquetes.listarActivos()).map((p) => p.codigo);

      expect(codigos).not.toContain(apagado);
      expect(codigos.indexOf(barato)).toBeLessThan(codigos.indexOf(caro));
    });

    it('un paquete apagado no se compra, pero se puede leer para acreditar una compra anterior', async () => {
      const apagado = await paquete({ activo: false });

      expect(await paquetes.buscarActivo(apagado)).toBeNull();
      expect(await paquetes.buscar(apagado)).toMatchObject({
        codigo: apagado,
        activo: false,
        credito: 200_000,
        precio: 190_000,
        descuentoBps: 500,
        horasReferencia: 5,
      });
      expect(await paquetes.buscar('prueba-rq-no-existe')).toBeNull();
    });

    it('rechaza un paquete que cuesta más de lo que da', async () => {
      const r = await rechazo(() =>
        pool.query(
          `insert into pagos.paquetes_de_bolsa (codigo, horas_referencia, descuento_bps, credito, precio)
           values ($1, 5, 0, 1000, 2000)`,
          [`prueba-rq-${nuevoId().slice(0, 12)}`],
        ),
      );

      expect(r.restriccion).toBe('paquetes_precio_valido');
    });
  });
});
