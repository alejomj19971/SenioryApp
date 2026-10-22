import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // /salud queda fuera del prefijo para los monitores de disponibilidad (docs/backend/M0 §4.10).
  app.setGlobalPrefix('api/v1', { exclude: ['salud', 'salud/listo'] });
  app.enableShutdownHooks();
  await app.listen(process.env.PUERTO ?? 3001);
}
await bootstrap();
