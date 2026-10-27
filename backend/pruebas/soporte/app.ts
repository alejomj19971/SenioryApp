import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import {
  configurarAplicacion,
  OPCIONES_DE_APLICACION,
} from '../../src/configurar-aplicacion.js';
import { CONFIGURACION } from '../../src/configuracion/configuracion.module.js';
import {
  configuracionDesdeVariables,
  validarVariables,
} from '../../src/configuracion/variables-de-entorno.js';

export interface OpcionesDeAppDePrueba {
  // Controladores extra, solo de prueba (por ejemplo, rutas que lanzan cada tipo de error).
  controladores?: Type[];
  // Variables de entorno que cambian respecto a las de prueba.
  variables?: Record<string, string>;
  // Para reemplazar proveedores (por ejemplo, el verificador de tokens).
  ajustar?: (constructor: TestingModuleBuilder) => TestingModuleBuilder;
}

// La aplicación completa, configurada como en main.ts, contra la base de pruebas (M0 §4.11).
export async function crearAppDePrueba(
  opciones: OpcionesDeAppDePrueba = {},
): Promise<NestExpressApplication> {
  const configuracion = configuracionDesdeVariables(
    validarVariables({
      NODE_ENV: 'test',
      URL_BASE_DE_DATOS: inject('urlBdPrueba'),
      ORIGENES_PERMITIDOS: 'http://localhost:3000',
      INTERVALO_SONDEO_OUTBOX_MS: '0',
      NIVEL_DE_LOG: 'error',
      ...opciones.variables,
    }),
  );
  let constructor = Test.createTestingModule({
    imports: [AppModule],
    controllers: opciones.controladores ?? [],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion);
  if (opciones.ajustar !== undefined) {
    constructor = opciones.ajustar(constructor);
  }
  const modulo = await constructor.compile();
  const app = modulo.createNestApplication<NestExpressApplication>(
    OPCIONES_DE_APLICACION,
  );
  configurarAplicacion(app, configuracion);
  await app.init();
  return app;
}
