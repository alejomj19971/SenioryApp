import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  configuracionDesdeVariables,
  validarVariables,
  type Configuracion,
  type Entorno,
  type NivelDeLog,
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
        };
        return configuracionDesdeVariables(variables);
      },
    },
  ],
  exports: [CONFIGURACION],
})
export class ConfiguracionModule {}
