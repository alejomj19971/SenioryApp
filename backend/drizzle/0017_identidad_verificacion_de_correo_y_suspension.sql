-- Verificación de correo y suspensión de cuentas (identidad).
--
-- 1) Tabla de los enlaces que llegan al correo para confirmar que es de la persona: misma forma que
--    tokens_de_recuperacion (solo el hash, de un solo uso, de vida limitada), aparte para que un enlace de un tipo
--    nunca sirva para el otro.
-- 2) El estado de una cuenta admite «suspendido» (un administrador la retiró; se puede reactivar), además de
--    «activo» y «eliminado». Las cuentas que ya existen no cambian.
--
-- Migración segura: solo agrega una tabla y AMPLÍA el CHECK (ningún dato existente lo incumple).
CREATE TABLE "identidad"."tokens_de_verificacion_de_correo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash_del_token" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	CONSTRAINT "tokens_verificacion_correo_hash_unico" UNIQUE("hash_del_token"),
	CONSTRAINT "tokens_verificacion_correo_hash_valido" CHECK (octet_length(hash_del_token) = 32),
	CONSTRAINT "tokens_verificacion_correo_vigencia_valida" CHECK (expira_en > creado_en)
);
--> statement-breakpoint
ALTER TABLE "identidad"."usuarios" DROP CONSTRAINT "usuarios_estado_valido";--> statement-breakpoint
ALTER TABLE "identidad"."tokens_de_verificacion_de_correo" ADD CONSTRAINT "tokens_de_verificacion_de_correo_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidad"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_verificacion_correo_usuario_idx" ON "identidad"."tokens_de_verificacion_de_correo" USING btree ("usuario_id","creado_en");--> statement-breakpoint
ALTER TABLE "identidad"."usuarios" ADD CONSTRAINT "usuarios_estado_valido" CHECK (estado in ('activo', 'suspendido', 'eliminado'));