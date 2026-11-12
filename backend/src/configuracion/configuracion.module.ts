import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  configuracionDesdeVariables,
  validarVariables,
  type Configuracion,
} from './variables-de-entorno.js';

// Símbolo de inyección de la configuración tipada y ya validada.
export const CONFIGURACION = Symbol('CONFIGURACION');

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // En producción las variables vienen del hosting: nunca se lee un archivo .env.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      // Si falta o es inválida una variable, la aplicación no inicia y el error dice cuál. Esto deja el
      // archivo .env cargado en `process.env` (dotenv es un efecto de lado de ConfigModule.forRoot) y falla
      // rápido con un mensaje claro ANTES de que el factory de abajo vuelva a validar.
      validate: (entorno: Record<string, unknown>) =>
        Object.assign({}, validarVariables(entorno)),
    }),
  ],
  providers: [
    {
      provide: CONFIGURACION,
      // Se arma DIRECTO de `process.env` con la misma función que ya lo valida — nunca copiando campo por
      // campo con ConfigService. Esa copia manual (una lista paralela a la clase VariablesDeEntorno) se
      // desincronizó dos veces (faltaron CLOUDINARY_* y luego MERCADOPAGO_*): pasaba la validación de arranque
      // pero la variable quedaba en null pese a estar definida. Sin esa lista, no hay nada que desincronizar.
      useFactory: (): Configuracion =>
        configuracionDesdeVariables(validarVariables(process.env)),
    },
  ],
  exports: [CONFIGURACION],
})
export class ConfiguracionModule {}
