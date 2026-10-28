DROP INDEX "directorio"."resenas_cuidador_idx";--> statement-breakpoint
DROP INDEX "mensajeria"."mensajes_paginacion_idx";--> statement-breakpoint
DROP INDEX "notificaciones"."notificaciones_destinatario_idx";--> statement-breakpoint
DROP INDEX "pagos"."politicas_vigencia_idx";--> statement-breakpoint
DROP INDEX "reservas"."servicios_familiar_idx";--> statement-breakpoint
DROP INDEX "teleasistencia"."alertas_adulto_mayor_idx";--> statement-breakpoint
DROP INDEX "teleasistencia"."lecturas_adulto_mayor_idx";--> statement-breakpoint
CREATE INDEX "resenas_cuidador_idx" ON "directorio"."resenas" USING btree ("cuidador_id","creada_en" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "mensajes_paginacion_idx" ON "mensajeria"."mensajes" USING btree ("conversacion_id","creado_en" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "notificaciones_destinatario_idx" ON "notificaciones"."notificaciones" USING btree ("destinatario_id","creada_en" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "politicas_vigencia_idx" ON "pagos"."politicas_de_precios" USING btree ("vigente_desde" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "servicios_familiar_idx" ON "reservas"."servicios" USING btree ("familiar_id","creado_en" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "alertas_adulto_mayor_idx" ON "teleasistencia"."alertas" USING btree ("adulto_mayor_id","generada_en" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "lecturas_adulto_mayor_idx" ON "teleasistencia"."lecturas_signos" USING btree ("adulto_mayor_id","tomada_en" DESC NULLS FIRST);