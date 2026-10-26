import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { CONFIGURACION } from './configuracion/configuracion.module.js';
import type { Configuracion } from './configuracion/variables-de-entorno.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuracion = app.get<Configuracion>(CONFIGURACION);

  // /salud queda fuera del prefijo para los monitores de disponibilidad (docs/backend/M0 §4.10).
  app.setGlobalPrefix('api/v1', { exclude: ['salud', 'salud/listo'] });
  app.enableShutdownHooks();
  await app.listen(configuracion.puerto);
}
await bootstrap();
