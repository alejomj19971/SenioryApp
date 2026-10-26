-- Base de la plataforma (docs/backend/M0 §4.5 y BASE_DE_DATOS.md §2).
-- Extensiones que usan los módulos: correos sin distinguir mayúsculas (citext),
-- búsqueda sin tildes y por similitud (unaccent, pg_trgm). Son extensiones "trusted":
-- las puede crear el dueño de la base sin ser superusuario.
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Esquema de lo transversal (outbox, eventos consumidos y auditoría llegan en el PR 4).
-- Cada módulo crea su propio esquema en su propia migración.
CREATE SCHEMA IF NOT EXISTS compartido;
