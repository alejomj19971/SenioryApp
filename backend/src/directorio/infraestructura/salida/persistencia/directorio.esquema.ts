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
  uniqueIndex,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  bytea,
  instante,
} from '../../../../compartido/infraestructura/base-de-datos/tipos.js';

// Esquema `directorio` (M2 lectura, M9 registro y verificación; BASE_DE_DATOS.md §3.3).
export const esquemaDirectorio = pgSchema('directorio');

export const cuidadores = esquemaDirectorio.table(
  'cuidadores',
  {
    id: uuid('id').primaryKey(),
    // Cuenta del cuidador en `identidad` (sin clave foránea entre esquemas, E13).
    usuarioId: uuid('usuario_id'),
    nombre: text('nombre').notNull(),
    // Texto normalizado (minúsculas, sin tildes) que llena la aplicación para buscar.
    nombreBusqueda: text('nombre_busqueda').notNull(),
    fotoUrl: text('foto_url'),
    especialidad: text('especialidad').notNull(),
    titulo: text('titulo').notNull(),
    aniosExperiencia: smallint('anios_experiencia').notNull(),
    // Pesos COP enteros por hora.
    tarifaHora: bigint('tarifa_hora', { mode: 'number' }).notNull(),
    // El teléfono NUNCA sale del módulo en listados (hallazgo H1).
    telefono: text('telefono').notNull(),
    zona: text('zona').notNull(),
    zonaBusqueda: text('zona_busqueda').notNull(),
    disponibilidad: text('disponibilidad').array().notNull(),
    bio: text('bio').notNull(),
    // Solo el propio cuidador activa la aceptación automática.
    aceptacionAutomatica: boolean('aceptacion_automatica')
      .notNull()
      .default(false),
    estado: text('estado').notNull().default('borrador'),
    // Se guarda (no se calcula en cada consulta); el dominio la recalcula al cambiar
    // una verificación, y un trigger impide marcarla visible sin las tres verificaciones (E7).
    visible: boolean('visible').notNull().default(false),
    // La calificación y el conteo son derivados; el promedio se calcula al leer.
    sumaCalificaciones: integer('suma_calificaciones').notNull().default(0),
    cantidadResenas: integer('cantidad_resenas').notNull().default(0),
    serviciosCompletados: integer('servicios_completados').notNull().default(0),
    version: integer('version').notNull().default(1),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [
    unique('cuidadores_usuario_unico').on(t.usuarioId),
    check(
      'cuidadores_especialidad_valida',
      sql`especialidad in ('auxiliar', 'enfermeria', 'fisioterapia', 'acompanamiento')`,
    ),
    check('cuidadores_tarifa_valida', sql`tarifa_hora > 0`),
    check(
      'cuidadores_experiencia_valida',
      sql`anios_experiencia between 0 and 60`,
    ),
    check(
      'cuidadores_disponibilidad_valida',
      sql`disponibilidad <@ array['manana', 'tarde', 'noche']::text[] and cardinality(disponibilidad) > 0`,
    ),
    check(
      'cuidadores_estado_valido',
      sql`estado in ('borrador', 'en_revision', 'activo', 'suspendido')`,
    ),
    check(
      'cuidadores_visible_si_activo',
      sql`not visible or estado = 'activo'`,
    ),
    check('cuidadores_bio_valida', sql`char_length(bio) <= 1000`),
    check(
      'cuidadores_contadores_validos',
      sql`servicios_completados >= 0 and cantidad_resenas >= 0 and suma_calificaciones >= 0`,
    ),
    check(
      'cuidadores_calificacion_coherente',
      sql`(cantidad_resenas = 0 and suma_calificaciones = 0) or (cantidad_resenas > 0 and suma_calificaciones between cantidad_resenas and cantidad_resenas * 5)`,
    ),
    check('cuidadores_telefono_e164', sql`telefono ~ '^[+][1-9][0-9]{7,14}$'`),
    // Solo se indexan los visibles: es lo que consulta la búsqueda.
    index('cuidadores_busqueda_idx')
      .on(t.especialidad, t.tarifaHora)
      .where(sql`visible`),
    index('cuidadores_disponibilidad_idx').using('gin', t.disponibilidad),
    index('cuidadores_nombre_trgm_idx').using(
      'gin',
      t.nombreBusqueda.op('gin_trgm_ops'),
    ),
    index('cuidadores_zona_trgm_idx').using(
      'gin',
      t.zonaBusqueda.op('gin_trgm_ops'),
    ),
  ],
);

export const verificaciones = esquemaDirectorio.table(
  'verificaciones',
  {
    id: uuid('id').primaryKey(),
    cuidadorId: uuid('cuidador_id')
      .notNull()
      .references(() => cuidadores.id),
    control: text('control').notNull(),
    estado: text('estado').notNull().default('pendiente'),
    // Administrador en `identidad`.
    revisadoPor: uuid('revisado_por'),
    revisadoEn: instante('revisado_en'),
    motivoRechazo: text('motivo_rechazo'),
    vigenteHasta: date('vigente_hasta', { mode: 'string' }),
    creadoEn: instante('creado_en').notNull().defaultNow(),
  },
  (t) => [
    // Una sola verificación vigente por control; las anteriores quedan como historial.
    uniqueIndex('verificaciones_vigente_unica')
      .on(t.cuidadorId, t.control)
      .where(sql`estado in ('pendiente', 'aprobada')`),
    index('verificaciones_cola_idx').on(t.estado, t.creadoEn),
    check(
      'verificaciones_control_valido',
      sql`control in ('antecedentes', 'titulos', 'psicotecnica')`,
    ),
    check(
      'verificaciones_estado_valido',
      sql`estado in ('pendiente', 'aprobada', 'rechazada', 'vencida')`,
    ),
    check(
      'verificaciones_rechazo_con_motivo',
      sql`estado <> 'rechazada' or motivo_rechazo is not null`,
    ),
    check(
      'verificaciones_aprobacion_con_revisor',
      sql`estado <> 'aprobada' or (revisado_por is not null and revisado_en is not null)`,
    ),
  ],
);

// Documentos del cuidador. Los de verificación (cédula, antecedentes…) son privados;
// solo la hoja de vida y la foto, una vez aprobadas, pueden ser públicas (hallazgo H10).
export const documentos = esquemaDirectorio.table(
  'documentos',
  {
    id: uuid('id').primaryKey(),
    cuidadorId: uuid('cuidador_id')
      .notNull()
      .references(() => cuidadores.id),
    tipo: text('tipo').notNull(),
    claveAlmacenamiento: text('clave_almacenamiento').notNull(),
    nombreOriginal: text('nombre_original').notNull(),
    tipoMime: text('tipo_mime').notNull(),
    tamanoBytes: integer('tamano_bytes').notNull(),
    sha256: bytea('sha256').notNull(),
    estado: text('estado').notNull().default('pendiente'),
    esPublico: boolean('es_publico').notNull().default(false),
    subidoEn: instante('subido_en').notNull().defaultNow(),
  },
  (t) => [
    unique('documentos_clave_unica').on(t.claveAlmacenamiento),
    index('documentos_cuidador_idx').on(t.cuidadorId),
    check(
      'documentos_tipo_valido',
      sql`tipo in ('cedula', 'antecedentes', 'titulo', 'psicotecnica', 'hoja_de_vida', 'foto')`,
    ),
    check(
      'documentos_tipo_mime_valido',
      sql`tipo_mime in ('application/pdf', 'image/jpeg', 'image/png')`,
    ),
    check('documentos_tamano_valido', sql`tamano_bytes between 1 and 10485760`),
    check(
      'documentos_estado_valido',
      sql`estado in ('pendiente', 'aprobado', 'rechazado')`,
    ),
    check(
      'documentos_publico_solo_si_aprobado',
      sql`not es_publico or (tipo in ('hoja_de_vida', 'foto') and estado = 'aprobado')`,
    ),
  ],
);

export const resenas = esquemaDirectorio.table(
  'resenas',
  {
    id: uuid('id').primaryKey(),
    cuidadorId: uuid('cuidador_id')
      .notNull()
      .references(() => cuidadores.id),
    // Servicio en `reservas`. Una reseña por servicio: el manejador del evento es idempotente.
    servicioId: uuid('servicio_id').notNull(),
    // Nombre abreviado para no exponer al autor, por ejemplo «Andrea G.».
    autorVisible: text('autor_visible').notNull(),
    calificacion: smallint('calificacion').notNull(),
    comentario: text('comentario'),
    oculta: boolean('oculta').notNull().default(false),
    creadaEn: instante('creada_en').notNull().defaultNow(),
  },
  (t) => [
    unique('resenas_servicio_unica').on(t.servicioId),
    index('resenas_cuidador_idx').on(
      t.cuidadorId,
      t.creadaEn.desc().nullsFirst(),
    ),
    check('resenas_calificacion_valida', sql`calificacion between 1 and 5`),
    check(
      'resenas_comentario_valido',
      sql`comentario is null or char_length(comentario) <= 500`,
    ),
  ],
);
