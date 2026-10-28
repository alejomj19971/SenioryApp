import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgSchema,
  smallint,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { instante } from '../../../../compartido/infraestructura/base-de-datos/tipos.js';

// Esquema `notificaciones` (M5, BASE_DE_DATOS.md §3.7).
// El contenido de los avisos NO lleva datos clínicos (minimización, Ley 1581).
export const esquemaNotificaciones = pgSchema('notificaciones');

export const notificaciones = esquemaNotificaciones.table(
  'notificaciones',
  {
    id: uuid('id').primaryKey(),
    // Usuario en `identidad`.
    destinatarioId: uuid('destinatario_id').notNull(),
    // Evento del outbox que originó el aviso.
    eventoId: uuid('evento_id').notNull(),
    tipo: text('tipo').notNull(),
    prioridad: text('prioridad').notNull().default('normal'),
    canal: text('canal').notNull(),
    estado: text('estado').notNull().default('pendiente'),
    parametros: jsonb('parametros')
      .notNull()
      .default(sql`'{}'::jsonb`),
    intentos: smallint('intentos').notNull().default(0),
    proximoIntentoEn: instante('proximo_intento_en').notNull().defaultNow(),
    creadaEn: instante('creada_en').notNull().defaultNow(),
    enviadaEn: instante('enviada_en'),
    entregadaEn: instante('entregada_en'),
    ultimoError: text('ultimo_error'),
  },
  (t) => [
    // Reprocesar un evento no repite el aviso.
    unique('notificaciones_deduplicacion_unica').on(
      t.eventoId,
      t.destinatarioId,
      t.tipo,
      t.canal,
    ),
    index('notificaciones_pendientes_idx')
      .on(t.proximoIntentoEn)
      .where(sql`estado = 'pendiente'`),
    index('notificaciones_destinatario_idx').on(
      t.destinatarioId,
      t.creadaEn.desc().nullsFirst(),
    ),
    check(
      'notificaciones_prioridad_valida',
      sql`prioridad in ('normal', 'alta')`,
    ),
    check(
      'notificaciones_canal_valido',
      sql`canal in ('app', 'correo', 'sms', 'whatsapp', 'push')`,
    ),
    check(
      'notificaciones_estado_valido',
      sql`estado in ('pendiente', 'enviada', 'entregada', 'fallida')`,
    ),
    check('notificaciones_intentos_validos', sql`intentos >= 0`),
    check(
      'notificaciones_entrega_con_fecha',
      sql`estado <> 'entregada' or entregada_en is not null`,
    ),
  ],
);

export const intentosDeEnvio = esquemaNotificaciones.table(
  'intentos_de_envio',
  {
    id: uuid('id').primaryKey(),
    notificacionId: uuid('notificacion_id')
      .notNull()
      .references(() => notificaciones.id),
    intentadoEn: instante('intentado_en').notNull().defaultNow(),
    resultado: text('resultado').notNull(),
    respuestaProveedor: text('respuesta_proveedor'),
  },
  (t) => [
    index('intentos_notificacion_idx').on(t.notificacionId, t.intentadoEn),
    check('intentos_resultado_valido', sql`resultado in ('exito', 'error')`),
  ],
);

export const preferenciasDeNotificacion = esquemaNotificaciones.table(
  'preferencias_de_notificacion',
  {
    // Usuario en `identidad`.
    usuarioId: uuid('usuario_id').primaryKey(),
    canales: text('canales')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Horario silencioso. Las alertas de teleasistencia lo ignoran.
    silencioDesde: time('silencio_desde'),
    silencioHasta: time('silencio_hasta'),
  },
  () => [
    check(
      'preferencias_canales_validos',
      sql`canales <@ array['app', 'correo', 'sms', 'whatsapp', 'push']::text[]`,
    ),
    check(
      'preferencias_silencio_completo',
      sql`(silencio_desde is null) = (silencio_hasta is null)`,
    ),
  ],
);
