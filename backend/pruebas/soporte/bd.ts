import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

// Códigos de error de Postgres (SQLSTATE) que usan las pruebas de restricciones.
export const UNICA = '23505';
export const CHECK = '23514';
export const FORANEA = '23503';
export const NO_NULO = '23502';
export const SOLO_INSERCION = '23001';

export type Ejecutor = Pick<pg.Pool, 'query'>;

// Conexión a la base compartida de la corrida (ver global-setup-bd.ts).
export function conectarBd(): pg.Pool {
  return new pg.Pool({ connectionString: inject('urlBdPrueba'), max: 4 });
}

export const nuevoId = (): string => randomUUID();

export interface Rechazo {
  codigo: string;
  restriccion: string | undefined;
  mensaje: string;
}

// Ejecuta algo que la base de datos DEBE rechazar y devuelve por qué.
// Falla si la operación fue aceptada: es la prueba de que la regla existe.
export async function rechazo(
  accion: () => Promise<unknown>,
): Promise<Rechazo> {
  try {
    await accion();
  } catch (error) {
    const e = error as { code?: string; constraint?: string; message?: string };
    return {
      codigo: e.code ?? '',
      restriccion: e.constraint,
      mensaje: e.message ?? '',
    };
  }
  throw new Error('La base de datos aceptó una operación que debía rechazar');
}

// Inserta una fila (las claves son nombres de columna). Los nombres vienen solo del código de pruebas.
export async function insertar(
  bd: Ejecutor,
  tabla: string,
  fila: Record<string, unknown>,
): Promise<void> {
  const columnas = Object.keys(fila);
  const marcadores = columnas.map((_, i) => `$${i + 1}`);
  await bd.query(
    `insert into ${tabla} (${columnas.join(', ')}) values (${marcadores.join(', ')})`,
    Object.values(fila),
  );
}

// Valores comunes
export const enDosHoras = (): string =>
  new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
export const ayer = (): string =>
  new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
export const enUnaSemana = (): string =>
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// ── Fábricas: filas válidas que cada prueba modifica para romper UNA regla ──

export const usuarioValido = (extra: Record<string, unknown> = {}) => {
  const id = nuevoId();
  return {
    id,
    correo: `${id}@prueba.invalid`,
    nombre: 'Usuario de prueba',
    rol: 'familiar',
    ...extra,
  };
};

export const adultoMayorValido = (
  creadoPor: string,
  extra: Record<string, unknown> = {},
) => ({
  id: nuevoId(),
  nombre: 'Carmen de prueba',
  fecha_de_nacimiento: '1948-03-15',
  creado_por: creadoPor,
  ...extra,
});

export const cuidadorValido = (extra: Record<string, unknown> = {}) => ({
  id: nuevoId(),
  nombre: 'Marta Restrepo',
  nombre_busqueda: 'marta restrepo',
  especialidad: 'enfermeria',
  titulo: 'Técnica en Enfermería',
  anios_experiencia: 7,
  tarifa_hora: 20000,
  telefono: '+573001234567',
  zona: 'Laureles, Medellín',
  zona_busqueda: 'laureles, medellin',
  disponibilidad: ['manana', 'tarde'],
  bio: 'Cuido con paciencia y cariño.',
  ...extra,
});

export const servicioValido = (extra: Record<string, unknown> = {}) => ({
  id: nuevoId(),
  familiar_id: nuevoId(),
  adulto_mayor_id: nuevoId(),
  cuidador_id: nuevoId(),
  fecha: enUnaSemana(),
  jornada: 'manana',
  horas: 1,
  estado: 'solicitado',
  medio_de_pago: 'pasarela',
  solicitud_expira_en: enDosHoras(),
  tarifa_hora: 20000,
  subtotal: 20000,
  cargo_familia: 1600,
  total_familia: 21600,
  pago_profesional: 18000,
  politica_version: 1,
  clave_idempotencia: nuevoId(),
  ...extra,
});

export const pagoValido = (extra: Record<string, unknown> = {}) => ({
  id: nuevoId(),
  concepto: 'servicio',
  servicio_id: nuevoId(),
  pagador_id: nuevoId(),
  medio: 'pasarela',
  monto_total: 21600,
  pago_profesional: 18000,
  ingreso_plataforma: 3600,
  politica_version: 1,
  clave_idempotencia: nuevoId(),
  ...extra,
});

export const medicamentoValido = (extra: Record<string, unknown> = {}) => ({
  id: nuevoId(),
  adulto_mayor_id: nuevoId(),
  nombre: 'Losartán',
  dosis: '50 mg',
  dias_semana: [1, 2, 3, 4, 5, 6, 7],
  vigente_desde: '2026-10-01',
  creado_por: nuevoId(),
  ...extra,
});

export const lecturaValida = (extra: Record<string, unknown> = {}) => ({
  id: nuevoId(),
  adulto_mayor_id: nuevoId(),
  tomada_en: new Date().toISOString(),
  presion_sistolica: 120,
  presion_diastolica: 80,
  frecuencia_cardiaca: 72,
  glucosa: 98,
  fuente: 'manual',
  ...extra,
});

// Crea un cuidador oculto y le aprueba los tres controles de verificación.
export async function cuidadorConVerificaciones(
  bd: Ejecutor,
  opciones: { vigenteHasta?: string | null; controles?: string[] } = {},
): Promise<string> {
  const revisor = usuarioValido({ rol: 'administrador' });
  await insertar(bd, 'identidad.usuarios', revisor);
  const cuidador = cuidadorValido({ estado: 'activo' });
  await insertar(bd, 'directorio.cuidadores', cuidador);
  for (const control of opciones.controles ?? [
    'antecedentes',
    'titulos',
    'psicotecnica',
  ]) {
    await insertar(bd, 'directorio.verificaciones', {
      id: nuevoId(),
      cuidador_id: cuidador.id,
      control,
      estado: 'aprobada',
      revisado_por: revisor.id,
      revisado_en: new Date().toISOString(),
      vigente_hasta: opciones.vigenteHasta ?? null,
    });
  }
  return cuidador.id;
}
