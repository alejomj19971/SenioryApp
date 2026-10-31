import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  configuracionDesdeVariables,
  validarVariables,
  type AlmacenDeArchivosConfigurado,
  type CanalDeRecuperacion,
  type Configuracion,
  type DispersorConfigurado,
  type Entorno,
  type NivelDeLog,
  type PasarelaConfigurada,
  type VariablesDeEntorno,
} from './variables-de-entorno.js';

// Símbolo de inyección de la configuración tipada y ya validada.
export const CONFIGURACION = Symbol('CONFIGURACION');

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // En producción las variables vienen del hosting: nunca se lee un archivo .env.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      // Si falta o es inválida una variable, la aplicación no inicia y el error dice cuál.
      // @nestjs/config guarda un objeto plano: se copian las propiedades de la instancia validada.
      validate: (entorno: Record<string, unknown>) =>
        Object.assign({}, validarVariables(entorno)),
    }),
  ],
  providers: [
    {
      provide: CONFIGURACION,
      inject: [ConfigService],
      useFactory: (servicio: ConfigService): Configuracion => {
        const variables: VariablesDeEntorno = {
          NODE_ENV: servicio.getOrThrow<Entorno>('NODE_ENV'),
          PUERTO: servicio.getOrThrow<number>('PUERTO'),
          URL_BASE_DE_DATOS: servicio.getOrThrow<string>('URL_BASE_DE_DATOS'),
          ORIGENES_PERMITIDOS: servicio.getOrThrow<string>(
            'ORIGENES_PERMITIDOS',
          ),
          NIVEL_DE_LOG: servicio.getOrThrow<NivelDeLog>('NIVEL_DE_LOG'),
          ZONA_HORARIA_NEGOCIO: servicio.getOrThrow<string>(
            'ZONA_HORARIA_NEGOCIO',
          ),
          INTERVALO_SONDEO_OUTBOX_MS: servicio.getOrThrow<number>(
            'INTERVALO_SONDEO_OUTBOX_MS',
          ),
          INTERVALO_EXPIRACION_SERVICIOS_MS: servicio.getOrThrow<number>(
            'INTERVALO_EXPIRACION_SERVICIOS_MS',
          ),
          INTERVALO_ENTREGA_NOTIFICACIONES_MS: servicio.getOrThrow<number>(
            'INTERVALO_ENTREGA_NOTIFICACIONES_MS',
          ),
          CANALES_DE_NOTIFICACION_SIMULADOS: servicio.getOrThrow<string>(
            'CANALES_DE_NOTIFICACION_SIMULADOS',
          ),
          PASARELA_DE_PAGOS:
            servicio.getOrThrow<PasarelaConfigurada>('PASARELA_DE_PAGOS'),
          SECRETO_DE_PASARELA: servicio.get<string>('SECRETO_DE_PASARELA'),
          DISPERSOR_DE_PAGOS:
            servicio.getOrThrow<DispersorConfigurado>('DISPERSOR_DE_PAGOS'),
          REQUIERE_PAGO_APROBADO: servicio.getOrThrow<string>(
            'REQUIERE_PAGO_APROBADO',
          ),
          MINUTOS_PARA_PAGAR: servicio.getOrThrow<number>('MINUTOS_PARA_PAGAR'),
          INTERVALO_EXPIRACION_PAGOS_MS: servicio.getOrThrow<number>(
            'INTERVALO_EXPIRACION_PAGOS_MS',
          ),
          INTERVALO_LIQUIDACION_MS: servicio.getOrThrow<number>(
            'INTERVALO_LIQUIDACION_MS',
          ),
          TOLERANCIA_DE_TOMA_MINUTOS: servicio.getOrThrow<number>(
            'TOLERANCIA_DE_TOMA_MINUTOS',
          ),
          INTERVALO_OMISION_TOMAS_MS: servicio.getOrThrow<number>(
            'INTERVALO_OMISION_TOMAS_MS',
          ),
          SENTRY_DSN: servicio.get<string>('SENTRY_DSN'),
          SECRETO_BFF: servicio.get<string>('SECRETO_BFF'),
          SECRETO_JWT_ACCESO: servicio.getOrThrow<string>('SECRETO_JWT_ACCESO'),
          ID_CLAVE_JWT: servicio.getOrThrow<string>('ID_CLAVE_JWT'),
          DURACION_ACCESO_MIN: servicio.getOrThrow<number>(
            'DURACION_ACCESO_MIN',
          ),
          DURACION_REFRESCO_DIAS: servicio.getOrThrow<number>(
            'DURACION_REFRESCO_DIAS',
          ),
          COOKIES_SEGURAS: servicio.getOrThrow<string>('COOKIES_SEGURAS'),
          VERSION_POLITICA_VIGENTE: servicio.getOrThrow<string>(
            'VERSION_POLITICA_VIGENTE',
          ),
          ALMACEN_DE_ARCHIVOS:
            servicio.getOrThrow<AlmacenDeArchivosConfigurado>(
              'ALMACEN_DE_ARCHIVOS',
            ),
          DIRECTORIO_DE_ARCHIVOS: servicio.getOrThrow<string>(
            'DIRECTORIO_DE_ARCHIVOS',
          ),
          SECRETO_DE_ARCHIVOS: servicio.get<string>('SECRETO_DE_ARCHIVOS'),
          URL_PUBLICA_DE_LA_API: servicio.get<string>('URL_PUBLICA_DE_LA_API'),
          CANAL_DE_RECUPERACION: servicio.getOrThrow<CanalDeRecuperacion>(
            'CANAL_DE_RECUPERACION',
          ),
          VERSION_CONSENTIMIENTO_SALUD_VIGENTE: servicio.getOrThrow<string>(
            'VERSION_CONSENTIMIENTO_SALUD_VIGENTE',
          ),
        };
        return configuracionDesdeVariables(variables);
      },
    },
  ],
  exports: [CONFIGURACION],
})
export class ConfiguracionModule {}
