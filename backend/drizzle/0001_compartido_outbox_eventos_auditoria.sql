CREATE SCHEMA IF NOT EXISTS "compartido";
--> statement-breakpoint
CREATE TABLE "compartido"."auditoria" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"accion" text NOT NULL,
	"recurso_tipo" text NOT NULL,
	"recurso_id" text,
	"resultado" text NOT NULL,
	"id_de_correlacion" uuid,
	"metadatos" jsonb,
	CONSTRAINT "auditoria_resultado_valido" CHECK (resultado in ('permitido', 'denegado', 'error'))
);
--> statement-breakpoint
CREATE TABLE "compartido"."eventos_consumidos" (
	"manejador" text NOT NULL,
	"evento_id" uuid NOT NULL,
	"consumido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_consumidos_manejador_evento_id_pk" PRIMARY KEY("manejador","evento_id")
);
--> statement-breakpoint
CREATE TABLE "compartido"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"version" smallint NOT NULL,
	"datos" jsonb NOT NULL,
	"id_de_correlacion" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"procesado_en" timestamp with time zone,
	"fallido_en" timestamp with time zone,
	"intentos" smallint DEFAULT 0 NOT NULL,
	"proxima_ejecucion" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_error" text,
	CONSTRAINT "outbox_intentos_validos" CHECK (intentos >= 0),
	CONSTRAINT "outbox_estado_coherente" CHECK (procesado_en is null or fallido_en is null)
);
--> statement-breakpoint
CREATE INDEX "auditoria_ocurrido_en_brin" ON "compartido"."auditoria" USING brin ("ocurrido_en");--> statement-breakpoint
CREATE INDEX "auditoria_por_recurso_idx" ON "compartido"."auditoria" USING btree ("recurso_tipo","recurso_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "auditoria_por_actor_idx" ON "compartido"."auditoria" USING btree ("actor_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "outbox_pendientes_idx" ON "compartido"."outbox" USING btree ("proxima_ejecucion") WHERE procesado_en is null and fallido_en is null;--> statement-breakpoint
-- Tablas de solo inserción (auditoría, libro de la bolsa de horas): ni UPDATE ni DELETE.
-- Para borrar por retención se desvincula una partición entera, nunca fila por fila.
CREATE FUNCTION "compartido"."prohibir_modificacion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla %.% es de solo inserción: no admite % de filas', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23001';
END
$$;
--> statement-breakpoint
CREATE TRIGGER "auditoria_solo_insercion"
BEFORE UPDATE OR DELETE ON "compartido"."auditoria"
FOR EACH ROW EXECUTE FUNCTION "compartido"."prohibir_modificacion"();
