import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CompartidoModule } from './compartido/compartido.module.js';
import { FiltroDeErrores } from './compartido/http/filtro-de-errores.js';
import {
  GuardDeAutenticacion,
  GuardDeLimiteDePeticiones,
  GuardDeOrigen,
  GuardDeRoles,
} from './compartido/http/guardias.js';
import { opcionesDeLogs } from './compartido/http/logs.js';
import { opcionesDeValidacion } from './compartido/http/validacion.js';
import { BaseDeDatosModule } from './compartido/infraestructura/base-de-datos/base-de-datos.module.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
} from './configuracion/configuracion.module.js';
import type { Configuracion } from './configuracion/variables-de-entorno.js';
import { IdentidadModule } from './identidad/identidad.module.js';
import { SaludController } from './salud/salud.controller.js';

const PETICIONES_POR_MINUTO = 100; // por IP; las rutas de /auth tienen límites más estrictos

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
    IdentidadModule,
  ],
  controllers: [SaludController],
  providers: [
    // Se ejecutan en este orden: origen, límite de peticiones, autenticación y roles.
    { provide: APP_GUARD, useClass: GuardDeOrigen },
    { provide: APP_GUARD, useClass: GuardDeLimiteDePeticiones },
    { provide: APP_GUARD, useClass: GuardDeAutenticacion },
    { provide: APP_GUARD, useClass: GuardDeRoles },
    { provide: APP_PIPE, useValue: new ValidationPipe(opcionesDeValidacion) },
    { provide: APP_FILTER, useClass: FiltroDeErrores },
  ],
})
export class AppModule {}
