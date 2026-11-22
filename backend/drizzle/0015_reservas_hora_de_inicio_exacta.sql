-- La familia ahora elige una hora de inicio exacta (en bloques de 30 min) en vez de solo una franja completa,
-- y el choque de horario se detecta por solapamiento real de tiempo, no por «misma fecha y jornada». Esto
-- permite que un cuidador atienda dos servicios cortos distintos en la misma franja, siempre que no se crucen.

-- 1. Agregar la columna sin NOT NULL todavía, para no romper las filas que ya existan.
ALTER TABLE "reservas"."servicios" ADD COLUMN "hora_inicio" integer;--> statement-breakpoint
-- 2. Rellenar las filas existentes con el inicio de su franja: es lo más fiel a como ya se comportaban (un
--    servicio de «tarde», por ejemplo, se trataba como si empezara a las 12:00).
UPDATE "reservas"."servicios" SET "hora_inicio" = CASE "jornada"
  WHEN 'manana' THEN 360
  WHEN 'tarde' THEN 720
  WHEN 'noche' THEN 1080
END;--> statement-breakpoint
-- 3. Ahora sí, exigir que no sea nulo.
ALTER TABLE "reservas"."servicios" ALTER COLUMN "hora_inicio" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas"."servicios" ADD CONSTRAINT "servicios_hora_inicio_valida" CHECK (hora_inicio >= 0 and hora_inicio < 1440 and hora_inicio % 30 = 0);--> statement-breakpoint
-- 4. Minutos de inicio/fin reales (desde el 1 de enero de 1970), el mismo espacio que ya usa el dominio
--    (franjas.ts) para comparar sin tropezar con UTC. Postgres las calcula solas para las filas existentes.
ALTER TABLE "reservas"."servicios" ADD COLUMN "inicio_en_minutos" integer GENERATED ALWAYS AS ((fecha - date '1970-01-01') * 1440 + hora_inicio) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas"."servicios" ADD COLUMN "fin_en_minutos" integer GENERATED ALWAYS AS ((fecha - date '1970-01-01') * 1440 + hora_inicio + horas * 60) STORED NOT NULL;--> statement-breakpoint
-- 5. Quitar el índice único parcial viejo: se reemplaza por la restricción de exclusión de más abajo.
DROP INDEX "reservas"."servicios_sin_doble_reserva";--> statement-breakpoint
-- 6. Sin doble reserva, por solapamiento REAL de horario (no ya «misma fecha y jornada»): necesita
--    `btree_gist` para combinar la igualdad de `cuidador_id` con el solapamiento del rango de tiempo.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "reservas"."servicios" ADD CONSTRAINT "servicios_sin_doble_reserva"
  EXCLUDE USING gist (
    cuidador_id WITH =,
    int4range(inicio_en_minutos, fin_en_minutos) WITH &&
  ) WHERE (estado in ('solicitado', 'aceptado', 'en_curso'));
