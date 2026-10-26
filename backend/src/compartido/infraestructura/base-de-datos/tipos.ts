import { customType, timestamp } from 'drizzle-orm/pg-core';

// Tipos de columna que Drizzle no trae de fábrica y que usan los esquemas de todos los módulos.
// Viven en `compartido` porque son utilidades de persistencia, no reglas de negocio.

// Texto sin distinguir mayúsculas (extensión citext, creada en la migración 0000).
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

// Datos binarios (por ejemplo, el hash SHA-256 de un token o de un archivo).
export const bytea = customType<{ data: Buffer }>({
  dataType: () => 'bytea',
});

// Instante con zona horaria (timestamptz). Siempre se guarda en UTC; la zona de
// negocio (America/Bogota) solo se aplica al presentar o al calcular fechas civiles.
export const instante = (nombre: string) =>
  timestamp(nombre, { withTimezone: true });
