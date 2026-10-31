import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../../../../app.module.js';
import { ContextoDePeticionAls } from '../../../../compartido/infraestructura/contexto-de-peticion-als.js';

// Levanta la aplicación SIN servidor HTTP (con la misma configuración, base de datos y módulos) para correr
// un comando de consola, y la cierra al terminar. Es la misma idea que el de Identidad: un módulo no puede
// usar la consola de otro, y mover esto a `compartido` lo haría depender de `app.module`.
export async function ejecutarComando<T>(
  trabajo: (aplicacion: INestApplicationContext) => Promise<T>,
): Promise<T> {
  const aplicacion = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const contexto = aplicacion.get(ContextoDePeticionAls, { strict: false });
    return await contexto.ejecutar(
      { idDeCorrelacion: uuidv7(), ipDelCliente: 'consola' },
      () => trabajo(aplicacion),
    );
  } finally {
    await aplicacion.close();
  }
}
