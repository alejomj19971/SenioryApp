-- Búsqueda por cercanía (M2, 2026-11-05): distancia real entre la familia que busca y el punto que el
-- cuidador fija en su perfil. "Trusted" desde Postgres 13: se crean sin ser superusuario, igual que
-- unaccent y pg_trgm en 0000.
CREATE EXTENSION IF NOT EXISTS cube;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS earthdistance;
--> statement-breakpoint
ALTER TABLE "directorio"."cuidadores" ADD COLUMN "latitud" double precision;--> statement-breakpoint
ALTER TABLE "directorio"."cuidadores" ADD COLUMN "longitud" double precision;--> statement-breakpoint
ALTER TABLE "directorio"."cuidadores" ADD CONSTRAINT "cuidadores_ubicacion_coherente" CHECK ((latitud is null) = (longitud is null));--> statement-breakpoint
ALTER TABLE "directorio"."cuidadores" ADD CONSTRAINT "cuidadores_latitud_valida" CHECK (latitud is null or latitud between -4.5 and 13.5);--> statement-breakpoint
ALTER TABLE "directorio"."cuidadores" ADD CONSTRAINT "cuidadores_longitud_valida" CHECK (longitud is null or longitud between -82 and -66.5);