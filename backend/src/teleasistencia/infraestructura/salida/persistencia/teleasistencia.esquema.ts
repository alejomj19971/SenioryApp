import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgSchema,
  smallint,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { instante } from '../../../../compartido/infraestructura/base-de-datos/tipos.js';

// Esquema `teleasistencia` (M6, BASE_DE_DATOS.md §3.6).
// ÚNICO esquema con datos de salud (sensibles, Ley 1581, art. 6): ningún otro módulo los guarda
// y todo acceso pasa por la política de acceso y queda en `compartido.auditoria` (E6).
export const esquemaTeleasistencia = pgSchema('teleasistencia');

// `adulto_mayor_id` y los ids de personas vienen de `identidad` (sin clave foránea, E13).

export const medicamentos = esquemaTeleasistencia.table(
  'medicamentos',
  {
    id: uuid('id').primaryKey(),
    adultoMayorId: uuid('adulto_mayor_id').notNull(),
    nombre: text('nombre').notNull(),
    dosis: text('dosis').notNull(),
    indicaciones: text('indicaciones'),
    // 1 = lunes … 7 = domingo.
    diasSemana: smallint('dias_semana').array().notNull(),
    vigenteDesde: date('vigente_desde', { mode: 'string' }).notNull(),
    vigenteHasta: date('vigente_hasta', { mode: 'string' }),
    activo: boolean('activo').notNull().default(true),
    creadoPor: uuid('creado_por').notNull(),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [
    index('medicamentos_activos_idx')
      .on(t.adultoMayorId)
      .where(sql`activo`),
    check(
      'medicamentos_dias_validos',
      sql`dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(dias_semana) > 0`,
    ),
    check(
      'medicamentos_vigencia_valida',
      sql`vigente_hasta is null or vigente_hasta >= vigente_desde`,
    ),
    check(
      'medicamentos_nombre_valido',
      sql`char_length(nombre) between 1 and 150 and char_length(dosis) between 1 and 100`,
    ),
  ],
);

export const horariosDeMedicamento = esquemaTeleasistencia.table(
  'horarios_de_medicamento',
  {
    id: uuid('id').primaryKey(),
    medicamentoId: uuid('medicamento_id')
      .notNull()
      .references(() => medicamentos.id, { onDelete: 'cascade' }),
    hora: time('hora').notNull(),
  },
  (t) => [
    unique('horarios_medicamento_hora_unica').on(t.medicamentoId, t.hora),
  ],
);

// Una toma por medicamento, día y hora programada. Generarlas es idempotente (E6/E9).
export const tomas = esquemaTeleasistencia.table(
  'tomas',
  {
    id: uuid('id').primaryKey(),
    medicamentoId: uuid('medicamento_id')
      .notNull()
      .references(() => medicamentos.id),
    // Copia para consultar las tomas del día sin unir tablas.
    adultoMayorId: uuid('adulto_mayor_id').notNull(),
    // Día civil en America/Bogota (hallazgo H6).
    fecha: date('fecha', { mode: 'string' }).notNull(),
    horaProgramada: time('hora_programada').notNull(),
    estado: text('estado').notNull().default('pendiente'),
    registradaPor: uuid('registrada_por'),
    registradaEn: instante('registrada_en'),
    version: integer('version').notNull().default(1),
    creadaEn: instante('creada_en').notNull().defaultNow(),
  },
  (t) => [
    unique('tomas_programada_unica').on(
      t.medicamentoId,
      t.fecha,
      t.horaProgramada,
    ),
    index('tomas_dia_idx').on(t.adultoMayorId, t.fecha),
    check(
      'tomas_estado_valido',
      sql`estado in ('pendiente', 'tomada', 'omitida')`,
    ),
    check(
      'tomas_tomada_con_fecha',
      sql`estado <> 'tomada' or registrada_en is not null`,
    ),
  ],
);

// Las medidas son opcionales: un cuidador puede medir solo la presión (hallazgo H8).
export const lecturasSignos = esquemaTeleasistencia.table(
  'lecturas_signos',
  {
    id: uuid('id').primaryKey(),
    adultoMayorId: uuid('adulto_mayor_id').notNull(),
    tomadaEn: instante('tomada_en').notNull(),
    presionSistolica: smallint('presion_sistolica'),
    presionDiastolica: smallint('presion_diastolica'),
    frecuenciaCardiaca: smallint('frecuencia_cardiaca'),
    glucosa: smallint('glucosa'),
    fueraDeRango: boolean('fuera_de_rango').notNull().default(false),
    fuente: text('fuente').notNull(),
    registradaPor: uuid('registrada_por'),
    creadaEn: instante('creada_en').notNull().defaultNow(),
  },
  (t) => [
    index('lecturas_adulto_mayor_idx').on(
      t.adultoMayorId,
      t.tomadaEn.desc().nullsFirst(),
    ),
    check(
      'lecturas_con_alguna_medida',
      sql`presion_sistolica is not null or frecuencia_cardiaca is not null or glucosa is not null`,
    ),
    // La presión se registra completa (sistólica y diastólica) o no se registra.
    check(
      'lecturas_presion_completa',
      sql`(presion_sistolica is null) = (presion_diastolica is null)`,
    ),
    check(
      'lecturas_presion_coherente',
      sql`presion_sistolica is null or presion_diastolica < presion_sistolica`,
    ),
    // Rangos plausibles: detectan errores de digitación, no condiciones clínicas.
    check(
      'lecturas_rangos_plausibles',
      sql`(presion_sistolica is null or presion_sistolica between 50 and 260)
        and (presion_diastolica is null or presion_diastolica between 30 and 160)
        and (frecuencia_cardiaca is null or frecuencia_cardiaca between 20 and 250)
        and (glucosa is null or glucosa between 20 and 600)`,
    ),
    check('lecturas_fuente_valida', sql`fuente in ('manual', 'dispositivo')`),
  ],
);

// Rangos de referencia de cada persona. Sin fila = rangos por defecto.
// Los valores los define un profesional de salud, no el equipo de desarrollo.
export const rangosDeReferencia = esquemaTeleasistencia.table(
  'rangos_de_referencia',
  {
    adultoMayorId: uuid('adulto_mayor_id').primaryKey(),
    sistolicaMin: smallint('sistolica_min'),
    sistolicaMax: smallint('sistolica_max'),
    diastolicaMin: smallint('diastolica_min'),
    diastolicaMax: smallint('diastolica_max'),
    frecuenciaMin: smallint('frecuencia_min'),
    frecuenciaMax: smallint('frecuencia_max'),
    glucosaMin: smallint('glucosa_min'),
    glucosaMax: smallint('glucosa_max'),
    definidosPor: uuid('definidos_por').notNull(),
    actualizadosEn: instante('actualizados_en').notNull().defaultNow(),
  },
  () => [
    check(
      'rangos_minimos_menores_que_maximos',
      sql`(sistolica_min is null or sistolica_max is null or sistolica_min < sistolica_max)
        and (diastolica_min is null or diastolica_max is null or diastolica_min < diastolica_max)
        and (frecuencia_min is null or frecuencia_max is null or frecuencia_min < frecuencia_max)
        and (glucosa_min is null or glucosa_max is null or glucosa_min < glucosa_max)`,
    ),
  ],
);

export const alertas = esquemaTeleasistencia.table(
  'alertas',
  {
    id: uuid('id').primaryKey(),
    adultoMayorId: uuid('adulto_mayor_id').notNull(),
    origen: text('origen').notNull(),
    estado: text('estado').notNull().default('generada'),
    generadaPor: uuid('generada_por').notNull(),
    // Llave que genera el cliente: un reintento por mala conexión no crea dos alertas (hallazgo H7).
    claveIdempotencia: text('clave_idempotencia').notNull(),
    generadaEn: instante('generada_en').notNull().defaultNow(),
    // Se mide E11: primera_entrega_en − generada_en debe ser menor a 30 s en el 95 % de los casos.
    primeraEntregaEn: instante('primera_entrega_en'),
    atendidaPor: uuid('atendida_por'),
    atendidaEn: instante('atendida_en'),
    nota: text('nota'),
  },
  (t) => [
    unique('alertas_idempotencia_unica').on(t.generadaPor, t.claveIdempotencia),
    index('alertas_adulto_mayor_idx').on(
      t.adultoMayorId,
      t.generadaEn.desc().nullsFirst(),
    ),
    check(
      'alertas_origen_valido',
      sql`origen in ('boton', 'voz', 'signos', 'medicamento')`,
    ),
    check(
      'alertas_estado_valido',
      sql`estado in ('generada', 'notificada', 'atendida')`,
    ),
    check(
      'alertas_atencion_completa',
      sql`estado <> 'atendida' or (atendida_por is not null and atendida_en is not null)`,
    ),
    check(
      'alertas_entrega_posterior',
      sql`primera_entrega_en is null or primera_entrega_en >= generada_en`,
    ),
  ],
);
