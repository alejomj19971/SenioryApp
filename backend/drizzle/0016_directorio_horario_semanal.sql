-- El horario semanal del cuidador reemplaza la disponibilidad por jornada (mañana/tarde/noche, global, sin
-- distinguir día): ahora declara rangos de horas libres por día de la semana (lunes=1 … domingo=7).
--
-- Migración segura: se crea la tabla nueva, se RELLENA desde la columna vieja (expandiendo cada jornada a
-- los 7 días, con los mismos límites que `HORARIOS_DE_FRANJA`: mañana 06–12, tarde 12–18, noche 18–24 + 00–06
-- del día siguiente) y solo al final se quita la columna vieja. Así ningún cuidador existente pierde su
-- disponibilidad al desplegar.

CREATE TABLE "directorio"."horarios_libres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cuidador_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" integer NOT NULL,
	"hora_fin" integer NOT NULL,
	CONSTRAINT "horarios_libres_dia_valido" CHECK (dia_semana between 1 and 7),
	CONSTRAINT "horarios_libres_rango_valido" CHECK (hora_inicio >= 0 and hora_fin <= 1440 and hora_inicio < hora_fin
        and hora_inicio % 30 = 0 and hora_fin % 30 = 0)
);
--> statement-breakpoint
ALTER TABLE "directorio"."horarios_libres" ADD CONSTRAINT "horarios_libres_cuidador_id_cuidadores_id_fk" FOREIGN KEY ("cuidador_id") REFERENCES "directorio"."cuidadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "horarios_libres_cuidador_idx" ON "directorio"."horarios_libres" USING btree ("cuidador_id","dia_semana");--> statement-breakpoint

-- Relleno: la parte de cada jornada que cae dentro del mismo día (mañana y tarde completas; de la noche,
-- solo hasta las 24:00).
INSERT INTO "directorio"."horarios_libres" (id, cuidador_id, dia_semana, hora_inicio, hora_fin)
SELECT gen_random_uuid(), c.id, dia,
  CASE jornada WHEN 'manana' THEN 360 WHEN 'tarde' THEN 720 WHEN 'noche' THEN 1080 END,
  CASE jornada WHEN 'manana' THEN 720 WHEN 'tarde' THEN 1080 WHEN 'noche' THEN 1440 END
FROM "directorio"."cuidadores" c
CROSS JOIN generate_series(1, 7) AS dia
CROSS JOIN unnest(c.disponibilidad) AS jornada;
--> statement-breakpoint

-- Relleno: la cola de la noche que cruza la medianoche (00:00–06:00 del día siguiente).
INSERT INTO "directorio"."horarios_libres" (id, cuidador_id, dia_semana, hora_inicio, hora_fin)
SELECT gen_random_uuid(), c.id, (dia % 7) + 1, 0, 360
FROM "directorio"."cuidadores" c
CROSS JOIN generate_series(1, 7) AS dia
CROSS JOIN unnest(c.disponibilidad) AS jornada
WHERE jornada = 'noche';
--> statement-breakpoint

ALTER TABLE "directorio"."cuidadores" DROP CONSTRAINT "cuidadores_disponibilidad_valida";--> statement-breakpoint
DROP INDEX "directorio"."cuidadores_disponibilidad_idx";--> statement-breakpoint
ALTER TABLE "directorio"."cuidadores" DROP COLUMN "disponibilidad";
