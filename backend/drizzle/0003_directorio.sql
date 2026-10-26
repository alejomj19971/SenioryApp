CREATE SCHEMA "directorio";
--> statement-breakpoint
CREATE TABLE "directorio"."cuidadores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"nombre" text NOT NULL,
	"nombre_busqueda" text NOT NULL,
	"foto_url" text,
	"especialidad" text NOT NULL,
	"titulo" text NOT NULL,
	"anios_experiencia" smallint NOT NULL,
	"tarifa_hora" bigint NOT NULL,
	"telefono" text NOT NULL,
	"zona" text NOT NULL,
	"zona_busqueda" text NOT NULL,
	"disponibilidad" text[] NOT NULL,
	"bio" text NOT NULL,
	"aceptacion_automatica" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"visible" boolean DEFAULT false NOT NULL,
	"suma_calificaciones" integer DEFAULT 0 NOT NULL,
	"cantidad_resenas" integer DEFAULT 0 NOT NULL,
	"servicios_completados" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuidadores_usuario_unico" UNIQUE("usuario_id"),
	CONSTRAINT "cuidadores_especialidad_valida" CHECK (especialidad in ('auxiliar', 'enfermeria', 'fisioterapia', 'acompanamiento')),
	CONSTRAINT "cuidadores_tarifa_valida" CHECK (tarifa_hora > 0),
	CONSTRAINT "cuidadores_experiencia_valida" CHECK (anios_experiencia between 0 and 60),
	CONSTRAINT "cuidadores_disponibilidad_valida" CHECK (disponibilidad <@ array['manana', 'tarde', 'noche']::text[] and cardinality(disponibilidad) > 0),
	CONSTRAINT "cuidadores_estado_valido" CHECK (estado in ('borrador', 'en_revision', 'activo', 'suspendido')),
	CONSTRAINT "cuidadores_visible_si_activo" CHECK (not visible or estado = 'activo'),
	CONSTRAINT "cuidadores_bio_valida" CHECK (char_length(bio) <= 1000),
	CONSTRAINT "cuidadores_contadores_validos" CHECK (servicios_completados >= 0 and cantidad_resenas >= 0 and suma_calificaciones >= 0),
	CONSTRAINT "cuidadores_calificacion_coherente" CHECK ((cantidad_resenas = 0 and suma_calificaciones = 0) or (cantidad_resenas > 0 and suma_calificaciones between cantidad_resenas and cantidad_resenas * 5)),
	CONSTRAINT "cuidadores_telefono_e164" CHECK (telefono ~ '^[+][1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "directorio"."documentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cuidador_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"clave_almacenamiento" text NOT NULL,
	"nombre_original" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"sha256" "bytea" NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"es_publico" boolean DEFAULT false NOT NULL,
	"subido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_clave_unica" UNIQUE("clave_almacenamiento"),
	CONSTRAINT "documentos_tipo_valido" CHECK (tipo in ('cedula', 'antecedentes', 'titulo', 'psicotecnica', 'hoja_de_vida', 'foto')),
	CONSTRAINT "documentos_tipo_mime_valido" CHECK (tipo_mime in ('application/pdf', 'image/jpeg', 'image/png')),
	CONSTRAINT "documentos_tamano_valido" CHECK (tamano_bytes between 1 and 10485760),
	CONSTRAINT "documentos_estado_valido" CHECK (estado in ('pendiente', 'aprobado', 'rechazado')),
	CONSTRAINT "documentos_publico_solo_si_aprobado" CHECK (not es_publico or (tipo in ('hoja_de_vida', 'foto') and estado = 'aprobado'))
);
--> statement-breakpoint
CREATE TABLE "directorio"."resenas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cuidador_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"autor_visible" text NOT NULL,
	"calificacion" smallint NOT NULL,
	"comentario" text,
	"oculta" boolean DEFAULT false NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resenas_servicio_unica" UNIQUE("servicio_id"),
	CONSTRAINT "resenas_calificacion_valida" CHECK (calificacion between 1 and 5),
	CONSTRAINT "resenas_comentario_valido" CHECK (comentario is null or char_length(comentario) <= 500)
);
--> statement-breakpoint
CREATE TABLE "directorio"."verificaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cuidador_id" uuid NOT NULL,
	"control" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"revisado_por" uuid,
	"revisado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"vigente_hasta" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verificaciones_control_valido" CHECK (control in ('antecedentes', 'titulos', 'psicotecnica')),
	CONSTRAINT "verificaciones_estado_valido" CHECK (estado in ('pendiente', 'aprobada', 'rechazada', 'vencida')),
	CONSTRAINT "verificaciones_rechazo_con_motivo" CHECK (estado <> 'rechazada' or motivo_rechazo is not null),
	CONSTRAINT "verificaciones_aprobacion_con_revisor" CHECK (estado <> 'aprobada' or (revisado_por is not null and revisado_en is not null))
);
--> statement-breakpoint
ALTER TABLE "directorio"."documentos" ADD CONSTRAINT "documentos_cuidador_id_cuidadores_id_fk" FOREIGN KEY ("cuidador_id") REFERENCES "directorio"."cuidadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directorio"."resenas" ADD CONSTRAINT "resenas_cuidador_id_cuidadores_id_fk" FOREIGN KEY ("cuidador_id") REFERENCES "directorio"."cuidadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directorio"."verificaciones" ADD CONSTRAINT "verificaciones_cuidador_id_cuidadores_id_fk" FOREIGN KEY ("cuidador_id") REFERENCES "directorio"."cuidadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cuidadores_busqueda_idx" ON "directorio"."cuidadores" USING btree ("especialidad","tarifa_hora") WHERE visible;--> statement-breakpoint
CREATE INDEX "cuidadores_disponibilidad_idx" ON "directorio"."cuidadores" USING gin ("disponibilidad");--> statement-breakpoint
CREATE INDEX "cuidadores_nombre_trgm_idx" ON "directorio"."cuidadores" USING gin ("nombre_busqueda" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "cuidadores_zona_trgm_idx" ON "directorio"."cuidadores" USING gin ("zona_busqueda" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documentos_cuidador_idx" ON "directorio"."documentos" USING btree ("cuidador_id");--> statement-breakpoint
CREATE INDEX "resenas_cuidador_idx" ON "directorio"."resenas" USING btree ("cuidador_id","creada_en" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "verificaciones_vigente_unica" ON "directorio"."verificaciones" USING btree ("cuidador_id","control") WHERE estado in ('pendiente', 'aprobada');--> statement-breakpoint
CREATE INDEX "verificaciones_cola_idx" ON "directorio"."verificaciones" USING btree ("estado","creado_en");
--> statement-breakpoint
-- E7: un cuidador solo puede ser visible si tiene las tres verificaciones aprobadas y vigentes.
-- Red de seguridad de la base de datos: el dominio ya lo calcula, pero un error de código
-- no puede dejar visible a un cuidador sin verificar. Flujo: se inserta oculto, se aprueban
-- las verificaciones y luego se marca visible. La vigencia se compara con la fecha de Colombia.
CREATE FUNCTION "directorio"."exigir_verificaciones_para_visible"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT count(DISTINCT v.control)
    FROM "directorio"."verificaciones" v
    WHERE v.cuidador_id = NEW.id
      AND v.estado = 'aprobada'
      AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= (now() AT TIME ZONE 'America/Bogota')::date)
  ) < 3 THEN
    RAISE EXCEPTION 'El cuidador % no puede ser visible sin las tres verificaciones aprobadas y vigentes', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "cuidadores_visible_requiere_verificaciones"
BEFORE INSERT OR UPDATE OF "visible" ON "directorio"."cuidadores"
FOR EACH ROW WHEN (NEW."visible")
EXECUTE FUNCTION "directorio"."exigir_verificaciones_para_visible"();
