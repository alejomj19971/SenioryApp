import { sql } from 'drizzle-orm';
import {
  bigint,
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { instante } from '../../../../compartido/infraestructura/base-de-datos/tipos.js';

// Esquema `reservas` (M4, BASE_DE_DATOS.md §3.4): contratación y ciclo de vida del servicio.
export const esquemaReservas = pgSchema('reservas');

// Horario de cada franja. Decidido el 2026-10-26: mañana 06–12, tarde 12–18, noche 18–06.
export const franjas = esquemaReservas.table(
  'franjas',
  {
    jornada: text('jornada').primaryKey(),
    horaInicio: time('hora_inicio').notNull(),
    horaFin: time('hora_fin').notNull(),
    cruzaMedianoche: boolean('cruza_medianoche').notNull(),
  },
  () => [
    check(
      'franjas_jornada_valida',
      sql`jornada in ('manana', 'tarde', 'noche')`,
    ),
    check(
      'franjas_cruce_coherente',
      sql`(hora_fin <= hora_inicio) = cruza_medianoche`,
    ),
  ],
);

export const servicios = esquemaReservas.table(
  'servicios',
  {
    id: uuid('id').primaryKey(),
    // Los tres vienen de otros esquemas: identidad (familiar, persona mayor) y directorio (cuidador).
    familiarId: uuid('familiar_id').notNull(),
    adultoMayorId: uuid('adulto_mayor_id').notNull(),
    cuidadorId: uuid('cuidador_id').notNull(),
    // Día civil en America/Bogota (hallazgo H2): nunca un instante UTC.
    fecha: date('fecha', { mode: 'string' }).notNull(),
    jornada: text('jornada')
      .notNull()
      .references(() => franjas.jornada),
    horas: smallint('horas').notNull(),
    estado: text('estado').notNull().default('solicitado'),
    medioDePago: text('medio_de_pago').notNull(),
    // Copia de la preferencia del cuidador al momento de solicitar.
    aceptacionAutomatica: boolean('aceptacion_automatica')
      .notNull()
      .default(false),
    // Plazo para que el cuidador acepte; una tarea cancela los vencidos con motivo «expirada».
    solicitudExpiraEn: instante('solicitud_expira_en'),
    // Desglose congelado al solicitar: si cambian la tarifa o las comisiones, el servicio
    // conserva el precio con el que se contrató (E10).
    tarifaHora: bigint('tarifa_hora', { mode: 'number' }).notNull(),
    subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
    cargoFamilia: bigint('cargo_familia', { mode: 'number' }).notNull(),
    totalFamilia: bigint('total_familia', { mode: 'number' }).notNull(),
    pagoProfesional: bigint('pago_profesional', { mode: 'number' }).notNull(),
    // Versión de la política de precios en `pagos`.
    politicaVersion: integer('politica_version').notNull(),
    claveIdempotencia: text('clave_idempotencia').notNull(),
    solicitadoEn: instante('solicitado_en').notNull().defaultNow(),
    aceptadoEn: instante('aceptado_en'),
    iniciadoEn: instante('iniciado_en'),
    finalizadoEn: instante('finalizado_en'),
    canceladoEn: instante('cancelado_en'),
    canceladoPor: uuid('cancelado_por'),
    motivoCancelacion: text('motivo_cancelacion'),
    // Bloqueo optimista: dos cambios simultáneos no se pisan.
    version: integer('version').notNull().default(1),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [
    // Sin doble reserva: un cuidador no puede tener dos servicios activos en la misma
    // fecha y jornada. Si dos familias reservan a la vez, una recibe 409.
    uniqueIndex('servicios_sin_doble_reserva')
      .on(t.cuidadorId, t.fecha, t.jornada)
      .where(sql`estado in ('solicitado', 'aceptado', 'en_curso')`),
    // Un reintento de la misma solicitud no crea dos servicios.
    unique('servicios_idempotencia_unica').on(
      t.familiarId,
      t.claveIdempotencia,
    ),
    index('servicios_adulto_mayor_idx').on(t.adultoMayorId, t.fecha),
    index('servicios_familiar_idx').on(
      t.familiarId,
      t.creadoEn.desc().nullsFirst(),
    ),
    index('servicios_cuidador_idx').on(t.cuidadorId, t.fecha),
    // Las solicitudes pendientes que debe revisar la tarea de expiración.
    index('servicios_por_expirar_idx')
      .on(t.solicitudExpiraEn)
      .where(sql`estado = 'solicitado'`),
    check('servicios_horas_validas', sql`horas between 1 and 8`),
    check(
      'servicios_estado_valido',
      sql`estado in ('solicitado', 'aceptado', 'en_curso', 'finalizado', 'cancelado')`,
    ),
    check(
      'servicios_medio_valido',
      sql`medio_de_pago in ('pasarela', 'bolsa')`,
    ),
    check(
      'servicios_desglose_coherente',
      sql`tarifa_hora > 0 and subtotal = tarifa_hora * horas and total_familia = subtotal + cargo_familia and cargo_familia >= 0 and pago_profesional between 0 and subtotal`,
    ),
    check(
      'servicios_solicitud_con_plazo',
      sql`estado <> 'solicitado' or solicitud_expira_en is not null`,
    ),
    check(
      'servicios_marcas_de_tiempo_coherentes',
      sql`(estado <> 'cancelado' or cancelado_en is not null)
        and (estado not in ('aceptado', 'en_curso', 'finalizado') or aceptado_en is not null)
        and (estado not in ('en_curso', 'finalizado') or iniciado_en is not null)
        and (estado <> 'finalizado' or finalizado_en is not null)`,
    ),
  ],
);

// Una fila por cada transición válida del servicio: trazabilidad de E9.
export const historialDeEstados = esquemaReservas.table(
  'historial_de_estados',
  {
    id: uuid('id').primaryKey(),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id),
    desde: text('desde'),
    hacia: text('hacia').notNull(),
    accion: text('accion').notNull(),
    // Nulo cuando lo hace el sistema (por ejemplo, la expiración).
    actorId: uuid('actor_id'),
    ocurridoEn: instante('ocurrido_en').notNull().defaultNow(),
  },
  (t) => [index('historial_servicio_idx').on(t.servicioId, t.ocurridoEn)],
);

export const calificaciones = esquemaReservas.table(
  'calificaciones',
  {
    servicioId: uuid('servicio_id')
      .primaryKey()
      .references(() => servicios.id),
    familiarId: uuid('familiar_id').notNull(),
    calificacion: smallint('calificacion').notNull(),
    comentario: text('comentario'),
    creadaEn: instante('creada_en').notNull().defaultNow(),
  },
  () => [
    check('calificaciones_valor_valido', sql`calificacion between 1 and 5`),
    check(
      'calificaciones_comentario_valido',
      sql`comentario is null or char_length(comentario) <= 500`,
    ),
  ],
);
