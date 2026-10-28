CREATE SCHEMA "reservas";
--> statement-breakpoint
CREATE TABLE "reservas"."calificaciones" (
	"servicio_id" uuid PRIMARY KEY NOT NULL,
	"familiar_id" uuid NOT NULL,
	"calificacion" smallint NOT NULL,
	"comentario" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calificaciones_valor_valido" CHECK (calificacion between 1 and 5),
	CONSTRAINT "calificaciones_comentario_valido" CHECK (comentario is null or char_length(comentario) <= 500)
);
--> statement-breakpoint
CREATE TABLE "reservas"."franjas" (
	"jornada" text PRIMARY KEY NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	"cruza_medianoche" boolean NOT NULL,
	CONSTRAINT "franjas_jornada_valida" CHECK (jornada in ('manana', 'tarde', 'noche')),
	CONSTRAINT "franjas_cruce_coherente" CHECK ((hora_fin <= hora_inicio) = cruza_medianoche)
);
--> statement-breakpoint
CREATE TABLE "reservas"."historial_de_estados" (
	"id" uuid PRIMARY KEY NOT NULL,
	"servicio_id" uuid NOT NULL,
	"desde" text,
	"hacia" text NOT NULL,
	"accion" text NOT NULL,
	"actor_id" uuid,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas"."servicios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"familiar_id" uuid NOT NULL,
	"adulto_mayor_id" uuid NOT NULL,
	"cuidador_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"jornada" text NOT NULL,
	"horas" smallint NOT NULL,
	"estado" text DEFAULT 'solicitado' NOT NULL,
	"medio_de_pago" text NOT NULL,
	"aceptacion_automatica" boolean DEFAULT false NOT NULL,
	"solicitud_expira_en" timestamp with time zone,
	"tarifa_hora" bigint NOT NULL,
	"subtotal" bigint NOT NULL,
	"cargo_familia" bigint NOT NULL,
	"total_familia" bigint NOT NULL,
	"pago_profesional" bigint NOT NULL,
	"politica_version" integer NOT NULL,
	"clave_idempotencia" text NOT NULL,
	"solicitado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"aceptado_en" timestamp with time zone,
	"iniciado_en" timestamp with time zone,
	"finalizado_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"version" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servicios_idempotencia_unica" UNIQUE("familiar_id","clave_idempotencia"),
	CONSTRAINT "servicios_horas_validas" CHECK (horas between 1 and 8),
	CONSTRAINT "servicios_estado_valido" CHECK (estado in ('solicitado', 'aceptado', 'en_curso', 'finalizado', 'cancelado')),
	CONSTRAINT "servicios_medio_valido" CHECK (medio_de_pago in ('pasarela', 'bolsa')),
	CONSTRAINT "servicios_desglose_coherente" CHECK (tarifa_hora > 0 and subtotal = tarifa_hora * horas and total_familia = subtotal + cargo_familia and cargo_familia >= 0 and pago_profesional between 0 and subtotal),
	CONSTRAINT "servicios_solicitud_con_plazo" CHECK (estado <> 'solicitado' or solicitud_expira_en is not null),
	CONSTRAINT "servicios_marcas_de_tiempo_coherentes" CHECK ((estado <> 'cancelado' or cancelado_en is not null)
        and (estado not in ('aceptado', 'en_curso', 'finalizado') or aceptado_en is not null)
        and (estado not in ('en_curso', 'finalizado') or iniciado_en is not null)
        and (estado <> 'finalizado' or finalizado_en is not null))
);
--> statement-breakpoint
ALTER TABLE "reservas"."calificaciones" ADD CONSTRAINT "calificaciones_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "reservas"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas"."historial_de_estados" ADD CONSTRAINT "historial_de_estados_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "reservas"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas"."servicios" ADD CONSTRAINT "servicios_jornada_franjas_jornada_fk" FOREIGN KEY ("jornada") REFERENCES "reservas"."franjas"("jornada") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historial_servicio_idx" ON "reservas"."historial_de_estados" USING btree ("servicio_id","ocurrido_en");--> statement-breakpoint
CREATE UNIQUE INDEX "servicios_sin_doble_reserva" ON "reservas"."servicios" USING btree ("cuidador_id","fecha","jornada") WHERE estado in ('solicitado', 'aceptado', 'en_curso');--> statement-breakpoint
CREATE INDEX "servicios_adulto_mayor_idx" ON "reservas"."servicios" USING btree ("adulto_mayor_id","fecha");--> statement-breakpoint
CREATE INDEX "servicios_familiar_idx" ON "reservas"."servicios" USING btree ("familiar_id","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "servicios_cuidador_idx" ON "reservas"."servicios" USING btree ("cuidador_id","fecha");--> statement-breakpoint
CREATE INDEX "servicios_por_expirar_idx" ON "reservas"."servicios" USING btree ("solicitud_expira_en") WHERE estado = 'solicitado';
--> statement-breakpoint
-- Dato de referencia (BASE_DE_DATOS §9.1). Horarios decididos el 2026-10-26.
INSERT INTO "reservas"."franjas" ("jornada", "hora_inicio", "hora_fin", "cruza_medianoche") VALUES
  ('manana', '06:00', '12:00', false),
  ('tarde',  '12:00', '18:00', false),
  ('noche',  '18:00', '06:00', true);
