CREATE SCHEMA "identidad";
--> statement-breakpoint
CREATE TABLE "identidad"."aceptaciones_de_politica" (
	"usuario_id" uuid NOT NULL,
	"version" text NOT NULL,
	"aceptada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aceptaciones_de_politica_usuario_id_version_pk" PRIMARY KEY("usuario_id","version")
);
--> statement-breakpoint
CREATE TABLE "identidad"."adultos_mayores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"fecha_de_nacimiento" date NOT NULL,
	"foto_url" text,
	"usuario_id" uuid,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adultos_mayores_usuario_unico" UNIQUE("usuario_id"),
	CONSTRAINT "adultos_mayores_nombre_valido" CHECK (char_length(nombre) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "identidad"."consentimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adulto_mayor_id" uuid NOT NULL,
	"finalidad" text NOT NULL,
	"otorgado_por" uuid NOT NULL,
	"calidad" text NOT NULL,
	"version_del_texto" text NOT NULL,
	"otorgado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revocado_en" timestamp with time zone,
	CONSTRAINT "consentimientos_finalidad_valida" CHECK (finalidad in ('datos_de_salud')),
	CONSTRAINT "consentimientos_calidad_valida" CHECK (calidad in ('titular', 'representante')),
	CONSTRAINT "consentimientos_revocacion_posterior" CHECK (revocado_en is null or revocado_en >= otorgado_en)
);
--> statement-breakpoint
CREATE TABLE "identidad"."credenciales" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"intentos_fallidos" smallint DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credenciales_intentos_validos" CHECK (intentos_fallidos >= 0)
);
--> statement-breakpoint
CREATE TABLE "identidad"."sesiones_refresco" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"familia_id" uuid NOT NULL,
	"hash_del_token" "bytea" NOT NULL,
	"emitida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"reemplazada_en" timestamp with time zone,
	"reemplazada_por" uuid,
	"revocada_en" timestamp with time zone,
	CONSTRAINT "sesiones_refresco_hash_unico" UNIQUE("hash_del_token"),
	CONSTRAINT "sesiones_refresco_vigencia_valida" CHECK (expira_en > emitida_en)
);
--> statement-breakpoint
CREATE TABLE "identidad"."usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"correo" "citext" NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"rol" text NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"correo_verificado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_correo_unico" UNIQUE("correo"),
	CONSTRAINT "usuarios_rol_valido" CHECK (rol in ('familiar', 'adulto_mayor', 'cuidador', 'administrador')),
	CONSTRAINT "usuarios_estado_valido" CHECK (estado in ('activo', 'eliminado')),
	CONSTRAINT "usuarios_nombre_valido" CHECK (char_length(nombre) between 1 and 100),
	CONSTRAINT "usuarios_telefono_e164" CHECK (telefono is null or telefono ~ '^[+][1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "identidad"."vinculos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"familiar_id" uuid NOT NULL,
	"adulto_mayor_id" uuid NOT NULL,
	"parentesco" text NOT NULL,
	"es_responsable" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revocado_en" timestamp with time zone,
	CONSTRAINT "vinculos_parentesco_valido" CHECK (parentesco in ('hijo_hija', 'nieto_nieta', 'conyuge', 'hermano_hermana', 'otro')),
	CONSTRAINT "vinculos_estado_valido" CHECK (estado in ('activo', 'revocado')),
	CONSTRAINT "vinculos_revocacion_coherente" CHECK ((estado = 'revocado') = (revocado_en is not null))
);
--> statement-breakpoint
ALTER TABLE "identidad"."aceptaciones_de_politica" ADD CONSTRAINT "aceptaciones_de_politica_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."adultos_mayores" ADD CONSTRAINT "adultos_mayores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."adultos_mayores" ADD CONSTRAINT "adultos_mayores_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "identidad"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."consentimientos" ADD CONSTRAINT "consentimientos_adulto_mayor_id_adultos_mayores_id_fk" FOREIGN KEY ("adulto_mayor_id") REFERENCES "identidad"."adultos_mayores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."consentimientos" ADD CONSTRAINT "consentimientos_otorgado_por_usuarios_id_fk" FOREIGN KEY ("otorgado_por") REFERENCES "identidad"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."credenciales" ADD CONSTRAINT "credenciales_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."sesiones_refresco" ADD CONSTRAINT "sesiones_refresco_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."sesiones_refresco" ADD CONSTRAINT "sesiones_refresco_reemplazada_por_sesiones_refresco_id_fk" FOREIGN KEY ("reemplazada_por") REFERENCES "identidad"."sesiones_refresco"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."vinculos" ADD CONSTRAINT "vinculos_familiar_id_usuarios_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "identidad"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidad"."vinculos" ADD CONSTRAINT "vinculos_adulto_mayor_id_adultos_mayores_id_fk" FOREIGN KEY ("adulto_mayor_id") REFERENCES "identidad"."adultos_mayores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consentimientos_vigente_unico" ON "identidad"."consentimientos" USING btree ("adulto_mayor_id","finalidad") WHERE revocado_en is null;--> statement-breakpoint
CREATE INDEX "sesiones_refresco_familia_idx" ON "identidad"."sesiones_refresco" USING btree ("familia_id");--> statement-breakpoint
CREATE INDEX "sesiones_refresco_usuario_idx" ON "identidad"."sesiones_refresco" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculos_activo_unico" ON "identidad"."vinculos" USING btree ("familiar_id","adulto_mayor_id") WHERE estado = 'activo';--> statement-breakpoint
CREATE INDEX "vinculos_adulto_mayor_idx" ON "identidad"."vinculos" USING btree ("adulto_mayor_id");