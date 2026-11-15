CREATE TABLE "identidad"."desafios_de_segundo_factor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash_del_token" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	CONSTRAINT "desafios_segundo_factor_hash_unico" UNIQUE("hash_del_token"),
	CONSTRAINT "desafios_segundo_factor_hash_valido" CHECK (octet_length(hash_del_token) = 32),
	CONSTRAINT "desafios_segundo_factor_vigencia_valida" CHECK (expira_en > creado_en)
);
--> statement-breakpoint
CREATE TABLE "identidad"."segundos_factores" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"secreto_cifrado" "bytea" NOT NULL,
	"activado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identidad"."desafios_de_segundo_factor" ADD CONSTRAINT "desafios_de_segundo_factor_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."segundos_factores" ADD CONSTRAINT "segundos_factores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desafios_segundo_factor_usuario_idx" ON "identidad"."desafios_de_segundo_factor" USING btree ("usuario_id","creado_en");