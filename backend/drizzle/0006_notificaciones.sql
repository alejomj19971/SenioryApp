CREATE SCHEMA "notificaciones";
--> statement-breakpoint
CREATE TABLE "notificaciones"."intentos_de_envio" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notificacion_id" uuid NOT NULL,
	"intentado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text NOT NULL,
	"respuesta_proveedor" text,
	CONSTRAINT "intentos_resultado_valido" CHECK (resultado in ('exito', 'error'))
);
--> statement-breakpoint
CREATE TABLE "notificaciones"."notificaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"destinatario_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"canal" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"intentos" smallint DEFAULT 0 NOT NULL,
	"proximo_intento_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_en" timestamp with time zone,
	"entregada_en" timestamp with time zone,
	"ultimo_error" text,
	CONSTRAINT "notificaciones_deduplicacion_unica" UNIQUE("evento_id","destinatario_id","tipo","canal"),
	CONSTRAINT "notificaciones_prioridad_valida" CHECK (prioridad in ('normal', 'alta')),
	CONSTRAINT "notificaciones_canal_valido" CHECK (canal in ('app', 'correo', 'sms', 'whatsapp', 'push')),
	CONSTRAINT "notificaciones_estado_valido" CHECK (estado in ('pendiente', 'enviada', 'entregada', 'fallida')),
	CONSTRAINT "notificaciones_intentos_validos" CHECK (intentos >= 0),
	CONSTRAINT "notificaciones_entrega_con_fecha" CHECK (estado <> 'entregada' or entregada_en is not null)
);
--> statement-breakpoint
CREATE TABLE "notificaciones"."preferencias_de_notificacion" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"canales" text[] DEFAULT '{}'::text[] NOT NULL,
	"silencio_desde" time,
	"silencio_hasta" time,
	CONSTRAINT "preferencias_canales_validos" CHECK (canales <@ array['app', 'correo', 'sms', 'whatsapp', 'push']::text[]),
	CONSTRAINT "preferencias_silencio_completo" CHECK ((silencio_desde is null) = (silencio_hasta is null))
);
--> statement-breakpoint
ALTER TABLE "notificaciones"."intentos_de_envio" ADD CONSTRAINT "intentos_de_envio_notificacion_id_notificaciones_id_fk" FOREIGN KEY ("notificacion_id") REFERENCES "notificaciones"."notificaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intentos_notificacion_idx" ON "notificaciones"."intentos_de_envio" USING btree ("notificacion_id","intentado_en");--> statement-breakpoint
CREATE INDEX "notificaciones_pendientes_idx" ON "notificaciones"."notificaciones" USING btree ("proximo_intento_en") WHERE estado = 'pendiente';--> statement-breakpoint
CREATE INDEX "notificaciones_destinatario_idx" ON "notificaciones"."notificaciones" USING btree ("destinatario_id","creada_en" DESC NULLS LAST);