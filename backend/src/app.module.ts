import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { VERIFICADOR_DE_TOKENS } from './compartido/aplicacion/puertos/verificador-de-tokens.js';
import { CompartidoModule } from './compartido/compartido.module.js';
import { FiltroDeErrores } from './compartido/http/filtro-de-errores.js';
import {
  GuardDeAutenticacion,
  GuardDeLimiteDePeticiones,
  GuardDeRoles,
} from './compartido/http/guardias.js';
import { opcionesDeLogs } from './compartido/http/logs.js';
import { opcionesDeValidacion } from './compartido/http/validacion.js';
import { VerificadorQueRechazaTodo } from './compartido/http/verificador-que-rechaza-todo.js';
import { BaseDeDatosModule } from './compartido/infraestructura/base-de-datos/base-de-datos.module.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
} from './configuracion/configuracion.module.js';
import type { Configuracion } from './configuracion/variables-de-entorno.js';
import { SaludController } from './salud/salud.controller.js';

const PETICIONES_POR_MINUTO = 100; // por IP; M1 pone límites más estrictos en rutas sensibles

@Module({
  imports: [
    ConfiguracionModule,
    LoggerModule.forRootAsync({
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion) =>
        opcionesDeLogs(configuracion),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: PETICIONES_POR_MINUTO }]),
    BaseDeDatosModule,
    CompartidoModule,
  ],
  controllers: [SaludController],
  providers: [
    // M0: ninguna sesión es válida (toda ruta no pública responde 401). M1 lo reemplaza por el
    // verificador de Identidad.
    { provide: VERIFICADOR_DE_TOKENS, useClass: VerificadorQueRechazaTodo },
    // Se ejecutan en este orden: límite de peticiones, autenticación y roles.
    { provide: APP_GUARD, useClass: GuardDeLimiteDePeticiones },
    { provide: APP_GUARD, useClass: GuardDeAutenticacion },
    { provide: APP_GUARD, useClass: GuardDeRoles },
    { provide: APP_PIPE, useValue: new ValidationPipe(opcionesDeValidacion) },
    { provide: APP_FILTER, useClass: FiltroDeErrores },
  ],
})
export class AppModule {}
