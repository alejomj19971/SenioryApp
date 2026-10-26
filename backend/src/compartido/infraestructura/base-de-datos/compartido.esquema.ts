import { pgSchema } from 'drizzle-orm/pg-core';

// Esquema `compartido`: outbox, eventos consumidos y auditoría (PR 4 de M0).
// Cada módulo declara el suyo igual, en su propia carpeta de persistencia (E13):
// ningún módulo importa el esquema de otro.
export const esquemaCompartido = pgSchema('compartido');
