import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { instante } from '../../../../compartido/infraestructura/base-de-datos/tipos.js';

// Esquema `pagos` (M3 cotización, M7 cobro, bolsas y liquidación; BASE_DE_DATOS.md §3.5).
// Dinero siempre en pesos COP enteros (bigint); porcentajes en puntos básicos (8 % = 800).
export const esquemaPagos = pgSchema('pagos');

// Comisiones vigentes. Cada servicio guarda la versión con la que se cotizó,
// así un cambio de comisión no altera servicios ya contratados.
export const politicasDePrecios = esquemaPagos.table(
  'politicas_de_precios',
  {
    version: integer('version').primaryKey(),
    comisionFamiliaBps: integer('comision_familia_bps').notNull(),
    comisionProfesionalBps: integer('comision_profesional_bps').notNull(),
    vigenteDesde: instante('vigente_desde').notNull(),
    creadaEn: instante('creada_en').notNull().defaultNow(),
  },
  (t) => [
    check(
      'politicas_comisiones_validas',
      sql`comision_familia_bps between 0 and 10000 and comision_profesional_bps between 0 and 10000`,
    ),
    index('politicas_vigencia_idx').on(t.vigenteDesde.desc().nullsFirst()),
  ],
);

// Catálogo de bolsas de horas prepago. Sin filas hasta que el equipo empresarial apruebe
// los paquetes y la unidad (pesos u horas): la landing los muestra solo como ilustrativos.
export const paquetesDeBolsa = esquemaPagos.table(
  'paquetes_de_bolsa',
  {
    codigo: text('codigo').primaryKey(),
    horasReferencia: smallint('horas_referencia').notNull(),
    descuentoBps: integer('descuento_bps').notNull(),
    // Crédito en pesos que recibe la familia y precio que paga (con descuento).
    credito: bigint('credito', { mode: 'number' }).notNull(),
    precio: bigint('precio', { mode: 'number' }).notNull(),
    activo: boolean('activo').notNull().default(true),
  },
  () => [
    check('paquetes_horas_validas', sql`horas_referencia > 0`),
    check('paquetes_descuento_valido', sql`descuento_bps between 0 and 10000`),
    check(
      'paquetes_precio_valido',
      sql`precio > 0 and credito > 0 and precio <= credito`,
    ),
  ],
);

export const pagos = esquemaPagos.table(
  'pagos',
  {
    id: uuid('id').primaryKey(),
    concepto: text('concepto').notNull(),
    // Servicio en `reservas` (sin clave foránea entre esquemas).
    servicioId: uuid('servicio_id'),
    paqueteCodigo: text('paquete_codigo').references(
      () => paquetesDeBolsa.codigo,
    ),
    // Usuario en `identidad`.
    pagadorId: uuid('pagador_id').notNull(),
    medio: text('medio').notNull(),
    montoTotal: bigint('monto_total', { mode: 'number' }).notNull(),
    pagoProfesional: bigint('pago_profesional', { mode: 'number' }),
    ingresoPlataforma: bigint('ingreso_plataforma', { mode: 'number' }),
    politicaVersion: integer('politica_version').references(
      () => politicasDePrecios.version,
    ),
    moneda: char('moneda', { length: 3 }).notNull().default('COP'),
    estado: text('estado').notNull().default('pendiente'),
    proveedor: text('proveedor'),
    referenciaProveedor: text('referencia_proveedor'),
    // Llave que envía el cliente: dos envíos con la misma llave crean un solo pago (E3).
    claveIdempotencia: text('clave_idempotencia').notNull(),
    aprobadoEn: instante('aprobado_en'),
    version: integer('version').notNull().default(1),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [
    unique('pagos_idempotencia_unica').on(t.pagadorId, t.claveIdempotencia),
    unique('pagos_referencia_proveedor_unica').on(
      t.proveedor,
      t.referenciaProveedor,
    ),
    index('pagos_servicio_idx').on(t.servicioId),
    check('pagos_concepto_valido', sql`concepto in ('servicio', 'bolsa')`),
    check(
      'pagos_concepto_coherente',
      sql`(concepto = 'servicio') = (servicio_id is not null) and (concepto = 'bolsa') = (paquete_codigo is not null)`,
    ),
    check('pagos_medio_valido', sql`medio in ('pasarela', 'bolsa')`),
    // Una bolsa solo se compra con la pasarela, no con otra bolsa.
    check(
      'pagos_bolsa_se_paga_con_pasarela',
      sql`concepto <> 'bolsa' or medio = 'pasarela'`,
    ),
    check('pagos_moneda_valida', sql`moneda = 'COP'`),
    check('pagos_monto_valido', sql`monto_total > 0`),
    check(
      'pagos_estado_valido',
      sql`estado in ('pendiente', 'aprobado', 'rechazado', 'expirado', 'reembolsado')`,
    ),
    check(
      'pagos_aprobacion_con_fecha',
      sql`estado not in ('aprobado', 'reembolsado') or aprobado_en is not null`,
    ),
    // Para un servicio, el desglose es obligatorio y coherente (E10).
    check(
      'pagos_desglose_de_servicio_coherente',
      sql`concepto <> 'servicio' or (pago_profesional is not null and ingreso_plataforma is not null and politica_version is not null and pago_profesional >= 0 and ingreso_plataforma = monto_total - pago_profesional)`,
    ),
  ],
);

// Avisos que la pasarela envía por webhook. El mismo aviso se procesa una sola vez (E3).
// `cuerpo` nunca contiene datos de tarjeta.
export const eventosDePasarela = esquemaPagos.table(
  'eventos_de_pasarela',
  {
    id: uuid('id').primaryKey(),
    proveedor: text('proveedor').notNull(),
    idEventoExterno: text('id_evento_externo').notNull(),
    pagoId: uuid('pago_id').references(() => pagos.id),
    tipo: text('tipo').notNull(),
    cuerpo: jsonb('cuerpo').notNull(),
    firmaValida: boolean('firma_valida').notNull(),
    recibidoEn: instante('recibido_en').notNull().defaultNow(),
    procesadoEn: instante('procesado_en'),
  },
  (t) => [
    unique('eventos_pasarela_unico').on(t.proveedor, t.idEventoExterno),
    index('eventos_pasarela_pago_idx').on(t.pagoId),
  ],
);

export const bolsas = esquemaPagos.table(
  'bolsas',
  {
    id: uuid('id').primaryKey(),
    // Familiar en `identidad`.
    familiarId: uuid('familiar_id').notNull(),
    saldoDisponible: bigint('saldo_disponible', { mode: 'number' })
      .notNull()
      .default(0),
    saldoReservado: bigint('saldo_reservado', { mode: 'number' })
      .notNull()
      .default(0),
    version: integer('version').notNull().default(1),
    creadaEn: instante('creada_en').notNull().defaultNow(),
    actualizadaEn: instante('actualizada_en').notNull().defaultNow(),
  },
  (t) => [
    unique('bolsas_familiar_unica').on(t.familiarId),
    // La base impide un saldo negativo aunque el código falle.
    check(
      'bolsas_saldos_no_negativos',
      sql`saldo_disponible >= 0 and saldo_reservado >= 0`,
    ),
  ],
);

// Libro de la bolsa: solo de inserción (un trigger prohíbe UPDATE y DELETE). El saldo de
// `bolsas` se actualiza en la misma transacción que inserta el movimiento.
export const movimientosDeBolsa = esquemaPagos.table(
  'movimientos_de_bolsa',
  {
    id: uuid('id').primaryKey(),
    bolsaId: uuid('bolsa_id')
      .notNull()
      .references(() => bolsas.id),
    tipo: text('tipo').notNull(),
    deltaDisponible: bigint('delta_disponible', { mode: 'number' }).notNull(),
    deltaReservado: bigint('delta_reservado', { mode: 'number' }).notNull(),
    servicioId: uuid('servicio_id'),
    pagoId: uuid('pago_id').references(() => pagos.id),
    creadoEn: instante('creado_en').notNull().defaultNow(),
  },
  (t) => [
    // Reprocesar un evento no reserva, consume ni libera dos veces el mismo servicio.
    uniqueIndex('movimientos_servicio_unico')
      .on(t.bolsaId, t.tipo, t.servicioId)
      .where(sql`servicio_id is not null`),
    index('movimientos_bolsa_idx').on(t.bolsaId, t.creadoEn),
    check(
      'movimientos_tipo_valido',
      sql`tipo in ('compra', 'reserva', 'consumo', 'liberacion', 'ajuste')`,
    ),
    // Las combinaciones válidas de cada tipo de movimiento.
    check(
      'movimientos_deltas_coherentes',
      sql`(tipo = 'compra' and delta_disponible > 0 and delta_reservado = 0)
        or (tipo = 'reserva' and delta_disponible < 0 and delta_reservado = -delta_disponible)
        or (tipo = 'consumo' and delta_disponible = 0 and delta_reservado < 0)
        or (tipo = 'liberacion' and delta_disponible > 0 and delta_reservado = -delta_disponible)
        or (tipo = 'ajuste' and delta_disponible <> 0 and delta_reservado = 0)`,
    ),
    check(
      'movimientos_servicio_requerido',
      sql`tipo not in ('reserva', 'consumo', 'liberacion') or servicio_id is not null`,
    ),
    check(
      'movimientos_pago_requerido',
      sql`tipo <> 'compra' or pago_id is not null`,
    ),
  ],
);

export const liquidaciones = esquemaPagos.table(
  'liquidaciones',
  {
    id: uuid('id').primaryKey(),
    // Cuidador en `directorio` y servicio en `reservas`.
    cuidadorId: uuid('cuidador_id').notNull(),
    servicioId: uuid('servicio_id').notNull(),
    monto: bigint('monto', { mode: 'number' }).notNull(),
    estado: text('estado').notNull().default('pendiente'),
    referenciaDispersion: text('referencia_dispersion'),
    creadaEn: instante('creada_en').notNull().defaultNow(),
    pagadaEn: instante('pagada_en'),
  },
  (t) => [
    // Una liquidación por servicio: reprocesar el evento no paga dos veces.
    unique('liquidaciones_servicio_unica').on(t.servicioId),
    index('liquidaciones_cuidador_idx').on(t.cuidadorId, t.creadaEn),
    check('liquidaciones_monto_valido', sql`monto > 0`),
    check(
      'liquidaciones_estado_valido',
      sql`estado in ('pendiente', 'enviada', 'pagada', 'fallida')`,
    ),
    check(
      'liquidaciones_pago_con_fecha',
      sql`estado <> 'pagada' or pagada_en is not null`,
    ),
  ],
);

export const conciliaciones = esquemaPagos.table(
  'conciliaciones',
  {
    id: uuid('id').primaryKey(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    totalPasarela: bigint('total_pasarela', { mode: 'number' }).notNull(),
    totalInterno: bigint('total_interno', { mode: 'number' }).notNull(),
    diferencias: integer('diferencias').notNull().default(0),
    detalle: jsonb('detalle'),
    ejecutadaEn: instante('ejecutada_en').notNull().defaultNow(),
  },
  (t) => [
    unique('conciliaciones_fecha_unica').on(t.fecha),
    check('conciliaciones_diferencias_validas', sql`diferencias >= 0`),
  ],
);
