import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Publico } from '../compartido/http/decoradores.js';
import {
  BASE_DE_DATOS,
  type BaseDeDatos,
} from '../compartido/infraestructura/base-de-datos/base-de-datos.module.js';

export interface EstadoDeSalud {
  estado: 'ok';
}

export interface EstadoDePreparacion {
  estado: 'listo' | 'no_listo';
  baseDeDatos: 'ok' | 'sin_conexion';
}

// Rutas para los monitores del hosting (M0 §4.10). Públicas y sin límite de peticiones: el monitor
// consulta cada pocos segundos desde la misma IP. Por eso también deben ser baratas.
@Publico()
@SkipThrottle()
@Controller('salud')
export class SaludController {
  constructor(@Inject(BASE_DE_DATOS) private readonly bd: BaseDeDatos) {}

  // El proceso está vivo.
  @Get()
  vivo(): EstadoDeSalud {
    return { estado: 'ok' };
  }

  // Puede atender peticiones: la base responde. Los eventos fallidos del outbox NO lo marcan como
  // «no listo»: sacar la API de servicio no los arregla; se vigilan en los logs (y en Sentry).
  @Get('listo')
  async listo(
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<EstadoDePreparacion> {
    try {
      await this.bd.execute(sql`select 1`);
      return { estado: 'listo', baseDeDatos: 'ok' };
    } catch {
      respuesta.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { estado: 'no_listo', baseDeDatos: 'sin_conexion' };
    }
  }
}
