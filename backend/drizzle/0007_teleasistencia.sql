CREATE SCHEMA "teleasistencia";
--> statement-breakpoint
CREATE TABLE "teleasistencia"."alertas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adulto_mayor_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"estado" text DEFAULT 'generada' NOT NULL,
	"generada_por" uuid NOT NULL,
	"clave_idempotencia" text NOT NULL,
	"generada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"primera_entrega_en" timestamp with time zone,
	"atendida_por" uuid,
	"atendida_en" timestamp with time zone,
	"nota" text,
	CONSTRAINT "alertas_idempotencia_unica" UNIQUE("generada_por","clave_idempotencia"),
	CONSTRAINT "alertas_origen_valido" CHECK (origen in ('boton', 'voz', 'signos', 'medicamento')),
	CONSTRAINT "alertas_estado_valido" CHECK (estado in ('generada', 'notificada', 'atendida')),
	CONSTRAINT "alertas_atencion_completa" CHECK (estado <> 'atendida' or (atendida_por is not null and atendida_en is not null)),
	CONSTRAINT "alertas_entrega_posterior" CHECK (primera_entrega_en is null or primera_entrega_en >= generada_en)
);
--> statement-breakpoint
CREATE TABLE "teleasistencia"."horarios_de_medicamento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"medicamento_id" uuid NOT NULL,
	"hora" time NOT NULL,
	CONSTRAINT "horarios_medicamento_hora_unica" UNIQUE("medicamento_id","hora")
);
--> statement-breakpoint
CREATE TABLE "teleasistencia"."lecturas_signos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adulto_mayor_id" uuid NOT NULL,
	"tomada_en" timestamp with time zone NOT NULL,
	"presion_sistolica" smallint,
	"presion_diastolica" smallint,
	"frecuencia_cardiaca" smallint,
	"glucosa" smallint,
	"fuera_de_rango" boolean DEFAULT false NOT NULL,
	"fuente" text NOT NULL,
	"registrada_por" uuid,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecturas_con_alguna_medida" CHECK (presion_sistolica is not null or frecuencia_cardiaca is not null or glucosa is not null),
	CONSTRAINT "lecturas_presion_completa" CHECK ((presion_sistolica is null) = (presion_diastolica is null)),
	CONSTRAINT "lecturas_presion_coherente" CHECK (presion_sistolica is null or presion_diastolica < presion_sistolica),
	CONSTRAINT "lecturas_rangos_plausibles" CHECK ((presion_sistolica is null or presion_sistolica between 50 and 260)
        and (presion_diastolica is null or presion_diastolica between 30 and 160)
        and (frecuencia_cardiaca is null or frecuencia_cardiaca between 20 and 250)
        and (glucosa is null or glucosa between 20 and 600)),
	CONSTRAINT "lecturas_fuente_valida" CHECK (fuente in ('manual', 'dispositivo'))
);
--> statement-breakpoint
CREATE TABLE "teleasistencia"."medicamentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adulto_mayor_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"dosis" text NOT NULL,
	"indicaciones" text,
	"dias_semana" smallint[] NOT NULL,
	"vigente_desde" date NOT NULL,
	"vigente_hasta" date,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicamentos_dias_validos" CHECK (dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(dias_semana) > 0),
	CONSTRAINT "medicamentos_vigencia_valida" CHECK (vigente_hasta is null or vigente_hasta >= vigente_desde),
	CONSTRAINT "medicamentos_nombre_valido" CHECK (char_length(nombre) between 1 and 150 and char_length(dosis) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "teleasistencia"."rangos_de_referencia" (
	"adulto_mayor_id" uuid PRIMARY KEY NOT NULL,
	"sistolica_min" smallint,
	"sistolica_max" smallint,
	"diastolica_min" smallint,
	"diastolica_max" smallint,
	"frecuencia_min" smallint,
	"frecuencia_max" smallint,
	"glucosa_min" smallint,
	"glucosa_max" smallint,
	"definidos_por" uuid NOT NULL,
	"actualizados_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rangos_minimos_menores_que_maximos" CHECK ((sistolica_min is null or sistolica_max is null or sistolica_min < sistolica_max)
        and (diastolica_min is null or diastolica_max is null or diastolica_min < diastolica_max)
        and (frecuencia_min is null or frecuencia_max is null or frecuencia_min < frecuencia_max)
        and (glucosa_min is null or glucosa_max is null or glucosa_min < glucosa_max))
);
--> statement-breakpoint
CREATE TABLE "teleasistencia"."tomas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"medicamento_id" uuid NOT NULL,
	"adulto_mayor_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"hora_programada" time NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"registrada_por" uuid,
	"registrada_en" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tomas_programada_unica" UNIQUE("medicamento_id","fecha","hora_programada"),
	CONSTRAINT "tomas_estado_valido" CHECK (estado in ('pendiente', 'tomada', 'omitida')),
	CONSTRAINT "tomas_tomada_con_fecha" CHECK (estado <> 'tomada' or registrada_en is not null)
);
--> statement-breakpoint
ALTER TABLE "teleasistencia"."horarios_de_medicamento" ADD CONSTRAINT "horarios_de_medicamento_medicamento_id_medicamentos_id_fk" FOREIGN KEY ("medicamento_id") REFERENCES "teleasistencia"."medicamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teleasistencia"."tomas" ADD CONSTRAINT "tomas_medicamento_id_medicamentos_id_fk" FOREIGN KEY ("medicamento_id") REFERENCES "teleasistencia"."medicamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_adulto_mayor_idx" ON "teleasistencia"."alertas" USING btree ("adulto_mayor_id","generada_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lecturas_adulto_mayor_idx" ON "teleasistencia"."lecturas_signos" USING btree ("adulto_mayor_id","tomada_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "medicamentos_activos_idx" ON "teleasistencia"."medicamentos" USING btree ("adulto_mayor_id") WHERE activo;--> statement-breakpoint
CREATE INDEX "tomas_dia_idx" ON "teleasistencia"."tomas" USING btree ("adulto_mayor_id","fecha");