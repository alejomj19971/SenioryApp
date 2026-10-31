CREATE TABLE "identidad"."tokens_de_recuperacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash_del_token" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	CONSTRAINT "tokens_de_recuperacion_hash_unico" UNIQUE("hash_del_token"),
	CONSTRAINT "tokens_de_recuperacion_hash_valido" CHECK (octet_length(hash_del_token) = 32),
	CONSTRAINT "tokens_de_recuperacion_vigencia_valida" CHECK (expira_en > creado_en)
);
--> statement-breakpoint
ALTER TABLE "identidad"."tokens_de_recuperacion" ADD CONSTRAINT "tokens_de_recuperacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_de_recuperacion_usuario_idx" ON "identidad"."tokens_de_recuperacion" USING btree ("usuario_id","creado_en");