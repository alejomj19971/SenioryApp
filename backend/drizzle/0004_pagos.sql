CREATE SCHEMA "pagos";
--> statement-breakpoint
CREATE TABLE "pagos"."bolsas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"familiar_id" uuid NOT NULL,
	"saldo_disponible" bigint DEFAULT 0 NOT NULL,
	"saldo_reservado" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bolsas_familiar_unica" UNIQUE("familiar_id"),
	CONSTRAINT "bolsas_saldos_no_negativos" CHECK (saldo_disponible >= 0 and saldo_reservado >= 0)
);
--> statement-breakpoint
CREATE TABLE "pagos"."conciliaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"total_pasarela" bigint NOT NULL,
	"total_interno" bigint NOT NULL,
	"diferencias" integer DEFAULT 0 NOT NULL,
	"detalle" jsonb,
	"ejecutada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conciliaciones_fecha_unica" UNIQUE("fecha"),
	CONSTRAINT "conciliaciones_diferencias_validas" CHECK (diferencias >= 0)
);
--> statement-breakpoint
CREATE TABLE "pagos"."eventos_de_pasarela" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proveedor" text NOT NULL,
	"id_evento_externo" text NOT NULL,
	"pago_id" uuid,
	"tipo" text NOT NULL,
	"cuerpo" jsonb NOT NULL,
	"firma_valida" boolean NOT NULL,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"procesado_en" timestamp with time zone,
	CONSTRAINT "eventos_pasarela_unico" UNIQUE("proveedor","id_evento_externo")
);
--> statement-breakpoint
CREATE TABLE "pagos"."liquidaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cuidador_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"monto" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"referencia_dispersion" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"pagada_en" timestamp with time zone,
	CONSTRAINT "liquidaciones_servicio_unica" UNIQUE("servicio_id"),
	CONSTRAINT "liquidaciones_monto_valido" CHECK (monto > 0),
	CONSTRAINT "liquidaciones_estado_valido" CHECK (estado in ('pendiente', 'enviada', 'pagada', 'fallida')),
	CONSTRAINT "liquidaciones_pago_con_fecha" CHECK (estado <> 'pagada' or pagada_en is not null)
);
--> statement-breakpoint
CREATE TABLE "pagos"."movimientos_de_bolsa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bolsa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"delta_disponible" bigint NOT NULL,
	"delta_reservado" bigint NOT NULL,
	"servicio_id" uuid,
	"pago_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_tipo_valido" CHECK (tipo in ('compra', 'reserva', 'consumo', 'liberacion', 'ajuste')),
	CONSTRAINT "movimientos_deltas_coherentes" CHECK ((tipo = 'compra' and delta_disponible > 0 and delta_reservado = 0)
        or (tipo = 'reserva' and delta_disponible < 0 and delta_reservado = -delta_disponible)
        or (tipo = 'consumo' and delta_disponible = 0 and delta_reservado < 0)
        or (tipo = 'liberacion' and delta_disponible > 0 and delta_reservado = -delta_disponible)
        or (tipo = 'ajuste' and delta_disponible <> 0 and delta_reservado = 0)),
	CONSTRAINT "movimientos_servicio_requerido" CHECK (tipo not in ('reserva', 'consumo', 'liberacion') or servicio_id is not null),
	CONSTRAINT "movimientos_pago_requerido" CHECK (tipo <> 'compra' or pago_id is not null)
);
--> statement-breakpoint
CREATE TABLE "pagos"."pagos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"concepto" text NOT NULL,
	"servicio_id" uuid,
	"paquete_codigo" text,
	"pagador_id" uuid NOT NULL,
	"medio" text NOT NULL,
	"monto_total" bigint NOT NULL,
	"pago_profesional" bigint,
	"ingreso_plataforma" bigint,
	"politica_version" integer,
	"moneda" char(3) DEFAULT 'COP' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"proveedor" text,
	"referencia_proveedor" text,
	"clave_idempotencia" text NOT NULL,
	"aprobado_en" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_idempotencia_unica" UNIQUE("pagador_id","clave_idempotencia"),
	CONSTRAINT "pagos_referencia_proveedor_unica" UNIQUE("proveedor","referencia_proveedor"),
	CONSTRAINT "pagos_concepto_valido" CHECK (concepto in ('servicio', 'bolsa')),
	CONSTRAINT "pagos_concepto_coherente" CHECK ((concepto = 'servicio') = (servicio_id is not null) and (concepto = 'bolsa') = (paquete_codigo is not null)),
	CONSTRAINT "pagos_medio_valido" CHECK (medio in ('pasarela', 'bolsa')),
	CONSTRAINT "pagos_bolsa_se_paga_con_pasarela" CHECK (concepto <> 'bolsa' or medio = 'pasarela'),
	CONSTRAINT "pagos_moneda_valida" CHECK (moneda = 'COP'),
	CONSTRAINT "pagos_monto_valido" CHECK (monto_total > 0),
	CONSTRAINT "pagos_estado_valido" CHECK (estado in ('pendiente', 'aprobado', 'rechazado', 'expirado', 'reembolsado')),
	CONSTRAINT "pagos_aprobacion_con_fecha" CHECK (estado not in ('aprobado', 'reembolsado') or aprobado_en is not null),
	CONSTRAINT "pagos_desglose_de_servicio_coherente" CHECK (concepto <> 'servicio' or (pago_profesional is not null and ingreso_plataforma is not null and politica_version is not null and pago_profesional >= 0 and ingreso_plataforma = monto_total - pago_profesional))
);
--> statement-breakpoint
CREATE TABLE "pagos"."paquetes_de_bolsa" (
	"codigo" text PRIMARY KEY NOT NULL,
	"horas_referencia" smallint NOT NULL,
	"descuento_bps" integer NOT NULL,
	"credito" bigint NOT NULL,
	"precio" bigint NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "paquetes_horas_validas" CHECK (horas_referencia > 0),
	CONSTRAINT "paquetes_descuento_valido" CHECK (descuento_bps between 0 and 10000),
	CONSTRAINT "paquetes_precio_valido" CHECK (precio > 0 and credito > 0 and precio <= credito)
);
--> statement-breakpoint
CREATE TABLE "pagos"."politicas_de_precios" (
	"version" integer PRIMARY KEY NOT NULL,
	"comision_familia_bps" integer NOT NULL,
	"comision_profesional_bps" integer NOT NULL,
	"vigente_desde" timestamp with time zone NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "politicas_comisiones_validas" CHECK (comision_familia_bps between 0 and 10000 and comision_profesional_bps between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "pagos"."eventos_de_pasarela" ADD CONSTRAINT "eventos_de_pasarela_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "pagos"."pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos"."movimientos_de_bolsa" ADD CONSTRAINT "movimientos_de_bolsa_bolsa_id_bolsas_id_fk" FOREIGN KEY ("bolsa_id") REFERENCES "pagos"."bolsas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos"."movimientos_de_bolsa" ADD CONSTRAINT "movimientos_de_bolsa_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "pagos"."pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos"."pagos" ADD CONSTRAINT "pagos_paquete_codigo_paquetes_de_bolsa_codigo_fk" FOREIGN KEY ("paquete_codigo") REFERENCES "pagos"."paquetes_de_bolsa"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos"."pagos" ADD CONSTRAINT "pagos_politica_version_politicas_de_precios_version_fk" FOREIGN KEY ("politica_version") REFERENCES "pagos"."politicas_de_precios"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_pasarela_pago_idx" ON "pagos"."eventos_de_pasarela" USING btree ("pago_id");--> statement-breakpoint
CREATE INDEX "liquidaciones_cuidador_idx" ON "pagos"."liquidaciones" USING btree ("cuidador_id","creada_en");--> statement-breakpoint
CREATE UNIQUE INDEX "movimientos_servicio_unico" ON "pagos"."movimientos_de_bolsa" USING btree ("bolsa_id","tipo","servicio_id") WHERE servicio_id is not null;--> statement-breakpoint
CREATE INDEX "movimientos_bolsa_idx" ON "pagos"."movimientos_de_bolsa" USING btree ("bolsa_id","creado_en");--> statement-breakpoint
CREATE INDEX "pagos_servicio_idx" ON "pagos"."pagos" USING btree ("servicio_id");--> statement-breakpoint
CREATE INDEX "politicas_vigencia_idx" ON "pagos"."politicas_de_precios" USING btree ("vigente_desde" DESC NULLS LAST);
--> statement-breakpoint
-- Dato de referencia (BASE_DE_DATOS §9.1): política de precios versión 1, del modelo de negocio:
-- 8 % a la familia y 10 % al profesional. No se cargan paquetes de bolsa hasta que el equipo
-- empresarial apruebe precios y unidad.
INSERT INTO "pagos"."politicas_de_precios" ("version", "comision_familia_bps", "comision_profesional_bps", "vigente_desde")
VALUES (1, 800, 1000, '2026-01-01 00:00:00-05');
--> statement-breakpoint
-- El libro de la bolsa es de solo inserción: los errores se corrigen con un movimiento de ajuste.
CREATE TRIGGER "movimientos_de_bolsa_solo_insercion"
BEFORE UPDATE OR DELETE ON "pagos"."movimientos_de_bolsa"
FOR EACH ROW EXECUTE FUNCTION "compartido"."prohibir_modificacion"();
