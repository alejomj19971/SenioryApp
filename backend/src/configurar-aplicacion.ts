import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ContextoDePeticionAls } from './compartido/infraestructura/contexto-de-peticion-als.js';
import {
  idDeCorrelacionDe,
  ipDelClienteDe,
} from './compartido/http/datos-de-la-peticion.js';
import { COOKIE_DE_ACCESO } from './compartido/http/guardias.js';
import type { Configuracion } from './configuracion/variables-de-entorno.js';

// Opciones con las que se crea la aplicación, en main.ts y en las pruebas de API.
export const OPCIONES_DE_APLICACION: NestApplicationOptions = {
  // El cuerpo se lee con límite propio (abajo); los logs esperan a pino.
  bodyParser: false,
  bufferLogs: true,
};

const LIMITE_DEL_CUERPO = '100kb'; // los archivos de M9 tendrán su propia ruta

// Todo lo transversal que no es un proveedor de Nest (M0 §4.10). Se usa igual en producción y en
// las pruebas, para que las pruebas de API ejerciten exactamente la misma aplicación.
export function configurarAplicacion(
  app: NestExpressApplication,
  configuracion: Configuracion,
): void {
  app.useLogger(app.get(Logger));

  // /salud queda fuera del prefijo para los monitores de disponibilidad.
  app.setGlobalPrefix('api/v1', { exclude: ['salud', 'salud/listo'] });

  // Contexto de cada petición (correlación e IP real) para logs, auditoría y eventos. Va primero:
  // todo lo demás corre dentro de él.
  const contexto = app.get(ContextoDePeticionAls);
  app.use(
    (
      peticion: Parameters<typeof idDeCorrelacionDe>[0],
      respuesta: Parameters<typeof idDeCorrelacionDe>[1],
      siguiente: () => void,
    ) => {
      contexto.ejecutar(
        {
          idDeCorrelacion: idDeCorrelacionDe(peticion, respuesta),
          ipDelCliente: ipDelClienteDe(peticion, configuracion.secretoBff),
        },
        siguiente,
      );
    },
  );

  // Cabeceras de seguridad. Fuera de producción se desactiva la política de contenido para que
  // funcione la interfaz de Swagger; en producción la API solo devuelve JSON y Swagger no existe.
  app.use(
    helmet({
      contentSecurityPolicy: configuracion.esProduccion ? undefined : false,
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: LIMITE_DEL_CUERPO });

  // Solo los orígenes configurados, con cookies (el navegador nunca llama directo a la API: lo hace
  // el BFF, pero se deja cerrado por si acaso).
  app.enableCors({
    origin: configuracion.origenesPermitidos,
    credentials: true,
  });

  if (!configuracion.esProduccion) {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Seniory API')
        .setDescription(
          'API de Seniory. Toda ruta exige sesión salvo las marcadas como públicas.',
        )
        .setVersion('1')
        .addCookieAuth(COOKIE_DE_ACCESO)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, documento);
  }
}
