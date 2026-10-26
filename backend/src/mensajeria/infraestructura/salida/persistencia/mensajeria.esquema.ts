import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgSchema,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { instante } from '../../../../compartido/infraestructura/base-de-datos/tipos.js';

// Esquema `mensajeria` (M8, BASE_DE_DATOS.md §3.8): conversaciones entre familia y cuidador.
export const esquemaMensajeria = pgSchema('mensajeria');

export const conversaciones = esquemaMensajeria.table(
  'conversaciones',
  {
    id: uuid('id').primaryKey(),
    // Familiar en `identidad` y cuidador en `directorio` (sin claves foráneas, E13).
    familiarId: uuid('familiar_id').notNull(),
    cuidadorId: uuid('cuidador_id').notNull(),
    creadaEn: instante('creada_en').notNull().defaultNow(),
    ultimoMensajeEn: instante('ultimo_mensaje_en'),
  },
  (t) => [
    // «Obtener o crear» sin duplicados.
    unique('conversaciones_pareja_unica').on(t.familiarId, t.cuidadorId),
    index('conversaciones_familiar_idx').on(
      t.familiarId,
      t.ultimoMensajeEn.desc(),
    ),
    index('conversaciones_cuidador_idx').on(
      t.cuidadorId,
      t.ultimoMensajeEn.desc(),
    ),
  ],
);

export const mensajes = esquemaMensajeria.table(
  'mensajes',
  {
    id: uuid('id').primaryKey(),
    conversacionId: uuid('conversacion_id')
      .notNull()
      .references(() => conversaciones.id),
    autorId: uuid('autor_id').notNull(),
    autorRol: text('autor_rol').notNull(),
    texto: text('texto').notNull(),
    // Id que genera el cliente: un reenvío por mala conexión no duplica el mensaje.
    idDeCliente: uuid('id_de_cliente').notNull(),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    leidoEn: instante('leido_en'),
  },
  (t) => [
    unique('mensajes_reenvio_unico').on(
      t.conversacionId,
      t.autorId,
      t.idDeCliente,
    ),
    // Paginación por cursor: del más reciente al más antiguo.
    index('mensajes_paginacion_idx').on(
      t.conversacionId,
      t.creadoEn.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    check('mensajes_autor_valido', sql`autor_rol in ('familiar', 'cuidador')`),
    check('mensajes_texto_valido', sql`char_length(texto) between 1 and 1000`),
  ],
);

// Nota para los repositorios: los índices descendentes de columnas NOT NULL se declaran
// `DESC NULLS FIRST` (el orden por defecto de Postgres) para que `ORDER BY x DESC` use el índice.
// Las conversaciones se ordenan por `ultimo_mensaje_en` (nulable): esa consulta debe pedir
// `DESC NULLS LAST` explícitamente, igual que su índice.
