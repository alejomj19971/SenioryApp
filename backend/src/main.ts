import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import {
  configurarAplicacion,
  OPCIONES_DE_APLICACION,
} from './configurar-aplicacion.js';
import { CONFIGURACION } from './configuracion/configuracion.module.js';
import type { Configuracion } from './configuracion/variables-de-entorno.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    OPCIONES_DE_APLICACION,
  );
  const configuracion = app.get<Configuracion>(CONFIGURACION);
  configurarAplicacion(app, configuracion);

  // Al recibir SIGTERM (despliegue o apagado): deja de aceptar peticiones, termina las que están en
  // curso, detiene el sondeo del outbox y cierra el pool de conexiones.
  app.enableShutdownHooks();
  await app.listen(configuracion.puerto);
}
await bootstrap();
