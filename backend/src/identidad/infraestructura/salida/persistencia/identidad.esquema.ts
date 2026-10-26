import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgSchema,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  bytea,
  citext,
  instante,
} from '../../../../compartido/infraestructura/base-de-datos/tipos.js';

// Esquema `identidad` (M1, docs/backend/BASE_DE_DATOS.md §3.2).
// Cuentas, sesiones, personas mayores, vínculos y consentimientos.
// NO guarda datos clínicos: esos viven solo en `teleasistencia`.
export const esquemaIdentidad = pgSchema('identidad');

export const usuarios = esquemaIdentidad.table(
  'usuarios',
  {
    id: uuid('id').primaryKey(),
    correo: citext('correo').notNull(),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    rol: text('rol').notNull(),
    estado: text('estado').notNull().default('activo'),
    correoVerificadoEn: instante('correo_verificado_en'),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [
    unique('usuarios_correo_unico').on(t.correo),
    check(
      'usuarios_rol_valido',
      sql`rol in ('familiar', 'adulto_mayor', 'cuidador', 'administrador')`,
    ),
    check('usuarios_estado_valido', sql`estado in ('activo', 'eliminado')`),
    check('usuarios_nombre_valido', sql`char_length(nombre) between 1 and 100`),
    // Formato internacional E.164, por ejemplo +573001234567.
    check(
      'usuarios_telefono_e164',
      sql`telefono is null or telefono ~ '^[+][1-9][0-9]{7,14}$'`,
    ),
  ],
);

export const credenciales = esquemaIdentidad.table(
  'credenciales',
  {
    usuarioId: uuid('usuario_id')
      .primaryKey()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    intentosFallidos: smallint('intentos_fallidos').notNull().default(0),
    bloqueadoHasta: instante('bloqueado_hasta'),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  () => [check('credenciales_intentos_validos', sql`intentos_fallidos >= 0`)],
);

// Cada renovación de sesión reemplaza el token por uno nuevo de la misma familia.
// Solo se guarda el hash del token, nunca el token.
export const sesionesRefresco = esquemaIdentidad.table(
  'sesiones_refresco',
  {
    id: uuid('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    familiaId: uuid('familia_id').notNull(),
    hashDelToken: bytea('hash_del_token').notNull(),
    emitidaEn: instante('emitida_en').notNull().defaultNow(),
    expiraEn: instante('expira_en').notNull(),
    reemplazadaEn: instante('reemplazada_en'),
    reemplazadaPor: uuid('reemplazada_por').references(
      (): AnyPgColumn => sesionesRefresco.id,
    ),
    revocadaEn: instante('revocada_en'),
  },
  (t) => [
    unique('sesiones_refresco_hash_unico').on(t.hashDelToken),
    check('sesiones_refresco_vigencia_valida', sql`expira_en > emitida_en`),
    index('sesiones_refresco_familia_idx').on(t.familiaId),
    index('sesiones_refresco_usuario_idx').on(t.usuarioId),
  ],
);

export const adultosMayores = esquemaIdentidad.table(
  'adultos_mayores',
  {
    id: uuid('id').primaryKey(),
    nombre: text('nombre').notNull(),
    // La edad se calcula con el reloj; no se guarda.
    fechaDeNacimiento: date('fecha_de_nacimiento', {
      mode: 'string',
    }).notNull(),
    fotoUrl: text('foto_url'),
    // Solo si algún día la persona mayor tiene cuenta propia.
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuarios.id),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [
    unique('adultos_mayores_usuario_unico').on(t.usuarioId),
    check(
      'adultos_mayores_nombre_valido',
      sql`char_length(nombre) between 1 and 100`,
    ),
  ],
);

export const vinculos = esquemaIdentidad.table(
  'vinculos',
  {
    id: uuid('id').primaryKey(),
    familiarId: uuid('familiar_id')
      .notNull()
      .references(() => usuarios.id),
    adultoMayorId: uuid('adulto_mayor_id')
      .notNull()
      .references(() => adultosMayores.id),
    parentesco: text('parentesco').notNull(),
    esResponsable: boolean('es_responsable').notNull().default(false),
    estado: text('estado').notNull().default('activo'),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    revocadoEn: instante('revocado_en'),
  },
  (t) => [
    // Un solo vínculo activo por pareja familiar–persona mayor.
    uniqueIndex('vinculos_activo_unico')
      .on(t.familiarId, t.adultoMayorId)
      .where(sql`estado = 'activo'`),
    index('vinculos_adulto_mayor_idx').on(t.adultoMayorId),
    check(
      'vinculos_parentesco_valido',
      sql`parentesco in ('hijo_hija', 'nieto_nieta', 'conyuge', 'hermano_hermana', 'otro')`,
    ),
    check('vinculos_estado_valido', sql`estado in ('activo', 'revocado')`),
    check(
      'vinculos_revocacion_coherente',
      sql`(estado = 'revocado') = (revocado_en is not null)`,
    ),
  ],
);

// Autorización para tratar datos de salud (Ley 1581, art. 6). El titular es la persona mayor;
// un familiar solo puede otorgarla como representante.
export const consentimientos = esquemaIdentidad.table(
  'consentimientos',
  {
    id: uuid('id').primaryKey(),
    adultoMayorId: uuid('adulto_mayor_id')
      .notNull()
      .references(() => adultosMayores.id),
    finalidad: text('finalidad').notNull(),
    otorgadoPor: uuid('otorgado_por')
      .notNull()
      .references(() => usuarios.id),
    calidad: text('calidad').notNull(),
    versionDelTexto: text('version_del_texto').notNull(),
    otorgadoEn: instante('otorgado_en').notNull().defaultNow(),
    revocadoEn: instante('revocado_en'),
  },
  (t) => [
    // Un solo consentimiento vigente por persona y finalidad.
    uniqueIndex('consentimientos_vigente_unico')
      .on(t.adultoMayorId, t.finalidad)
      .where(sql`revocado_en is null`),
    check(
      'consentimientos_finalidad_valida',
      sql`finalidad in ('datos_de_salud')`,
    ),
    check(
      'consentimientos_calidad_valida',
      sql`calidad in ('titular', 'representante')`,
    ),
    check(
      'consentimientos_revocacion_posterior',
      sql`revocado_en is null or revocado_en >= otorgado_en`,
    ),
  ],
);

export const aceptacionesDePolitica = esquemaIdentidad.table(
  'aceptaciones_de_politica',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    aceptadaEn: instante('aceptada_en').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.version] })],
);
