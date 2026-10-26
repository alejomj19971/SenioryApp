CREATE SCHEMA "mensajeria";
--> statement-breakpoint
CREATE TABLE "mensajeria"."conversaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"familiar_id" uuid NOT NULL,
	"cuidador_id" uuid NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_mensaje_en" timestamp with time zone,
	CONSTRAINT "conversaciones_pareja_unica" UNIQUE("familiar_id","cuidador_id")
);
--> statement-breakpoint
CREATE TABLE "mensajeria"."mensajes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"autor_rol" text NOT NULL,
	"texto" text NOT NULL,
	"id_de_cliente" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"leido_en" timestamp with time zone,
	CONSTRAINT "mensajes_reenvio_unico" UNIQUE("conversacion_id","autor_id","id_de_cliente"),
	CONSTRAINT "mensajes_autor_valido" CHECK (autor_rol in ('familiar', 'cuidador')),
	CONSTRAINT "mensajes_texto_valido" CHECK (char_length(texto) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "mensajeria"."mensajes" ADD CONSTRAINT "mensajes_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "mensajeria"."conversaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversaciones_familiar_idx" ON "mensajeria"."conversaciones" USING btree ("familiar_id","ultimo_mensaje_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversaciones_cuidador_idx" ON "mensajeria"."conversaciones" USING btree ("cuidador_id","ultimo_mensaje_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mensajes_paginacion_idx" ON "mensajeria"."mensajes" USING btree ("conversacion_id","creado_en" DESC NULLS LAST,"id" DESC NULLS LAST);