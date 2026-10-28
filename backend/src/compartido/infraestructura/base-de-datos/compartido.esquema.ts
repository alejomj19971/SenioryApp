import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { instante } from './tipos.js';

// Esquema `compartido`: lo transversal a todos los módulos (docs/backend/BASE_DE_DATOS.md §3.1).
// Cada módulo declara el suyo igual, en su propia carpeta de persistencia (E13):
// ningún módulo importa el esquema de otro.
export const esquemaCompartido = pgSchema('compartido');

// Bandeja de salida de eventos: el evento se guarda en la misma transacción que el cambio
// de negocio y un despachador lo entrega después (docs/backend/M0 §4.8).
export const outbox = esquemaCompartido.table(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    tipo: text('tipo').notNull(),
    version: smallint('version').notNull(),
    datos: jsonb('datos').notNull(),
    idDeCorrelacion: uuid('id_de_correlacion').notNull(),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    procesadoEn: instante('procesado_en'),
    fallidoEn: instante('fallido_en'),
    intentos: smallint('intentos').notNull().default(0),
    proximaEjecucion: instante('proxima_ejecucion').notNull().defaultNow(),
    ultimoError: text('ultimo_error'),
  },
  (t) => [
    check('outbox_intentos_validos', sql`intentos >= 0`),
    check(
      'outbox_estado_coherente',
      sql`procesado_en is null or fallido_en is null`,
    ),
    // Lo que busca el despachador: eventos pendientes, por orden de próxima ejecución.
    index('outbox_pendientes_idx')
      .on(t.proximaEjecucion)
      .where(sql`procesado_en is null and fallido_en is null`),
  ],
);

// Registro de qué manejador ya procesó qué evento: hace idempotente a cada manejador.
export const eventosConsumidos = esquemaCompartido.table(
  'eventos_consumidos',
  {
    manejador: text('manejador').notNull(),
    eventoId: uuid('evento_id').notNull(),
    consumidoEn: instante('consumido_en').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.manejador, t.eventoId] })],
);

// Quién hizo qué sobre qué recurso (E6). Solo IDs: nunca datos personales ni clínicos.
// Es de solo inserción: un trigger prohíbe UPDATE y DELETE (ver la migración).
export const auditoria = esquemaCompartido.table(
  'auditoria',
  {
    id: uuid('id').primaryKey(),
    ocurridoEn: instante('ocurrido_en').notNull().defaultNow(),
    actorId: uuid('actor_id'),
    accion: text('accion').notNull(),
    recursoTipo: text('recurso_tipo').notNull(),
    recursoId: text('recurso_id'),
    resultado: text('resultado').notNull(),
    idDeCorrelacion: uuid('id_de_correlacion'),
    metadatos: jsonb('metadatos'),
  },
  (t) => [
    check(
      'auditoria_resultado_valido',
      sql`resultado in ('permitido', 'denegado', 'error')`,
    ),
    // Crece mucho y se consulta por rangos de tiempo: BRIN es mucho más pequeño que un B-tree.
    index('auditoria_ocurrido_en_brin').using('brin', t.ocurridoEn),
    index('auditoria_por_recurso_idx').on(
      t.recursoTipo,
      t.recursoId,
      t.ocurridoEn,
    ),
    index('auditoria_por_actor_idx').on(t.actorId, t.ocurridoEn),
  ],
);
