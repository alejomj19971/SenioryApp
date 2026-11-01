import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NoAutenticado } from '../compartido/dominio/errores.js';
import { Publico } from '../compartido/http/decoradores.js';
import {
  BASE_DE_DATOS,
  type BaseDeDatos,
} from '../compartido/infraestructura/base-de-datos/base-de-datos.module.js';
import { CONFIGURACION } from '../configuracion/configuracion.module.js';
import type { Configuracion } from '../configuracion/variables-de-entorno.js';

export interface EstadoDelOutbox {
  // Eventos que todavía esperan a que alguien reaccione, y cuántos ya les toca.
  pendientes: number;
  vencidos: number;
  // Cuánto lleva esperando el más viejo de los que ya les toca (0 si no hay). Es EL número para alertar: si pasa de
  // un minuto, algo no está entregando eventos (cobros, avisos, alertas).
  retrasoMaximoSegundos: number;
  // Los que ya fallaron algunas veces y se están reintentando.
  conReintentos: number;
  // Los que agotaron sus reintentos en los últimos 7 días: alguien tiene que revisarlos.
  fallidosEnLaSemana: number;
}

export interface EstadoDeOperacion {
  outbox: EstadoDelOutbox;
}

const ENCABEZADO_DEL_SECRETO = 'x-seniory-operacion';

function iguales(a: string, b: string): boolean {
  // Se comparan los resúmenes: así el largo no depende del secreto y la comparación es de tiempo constante.
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

// Lo que mira el monitor del equipo (retraso de eventos, fallos). Se consulta con una clave de operación en un
// encabezado, no con una sesión: un monitor no inicia sesión. Si `SECRETO_DE_OPERACION` no está configurado, la ruta
// NO EXISTE (404). Solo devuelve conteos: ningún dato de ninguna persona.
@Publico()
@Controller('salud')
export class OperacionController {
  constructor(
    @Inject(BASE_DE_DATOS) private readonly bd: BaseDeDatos,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  @Get('operacion')
  async operacion(
    @Headers(ENCABEZADO_DEL_SECRETO) clave: string | undefined,
  ): Promise<EstadoDeOperacion> {
    const secreto = this.configuracion.secretoDeOperacion;
    if (secreto === null) throw new NotFoundException();
    if (clave === undefined || !iguales(clave, secreto)) {
      throw new NoAutenticado(
        'Falta la clave de operación',
        'operacion.clave_invalida',
      );
    }
    const resultado = await this.bd.execute<{
      pendientes: number;
      vencidos: number;
      retraso: number;
      con_reintentos: number;
      fallidos: number;
    }>(sql`
      select
        count(*) filter (where procesado_en is null and fallido_en is null)::int as pendientes,
        count(*) filter (where procesado_en is null and fallido_en is null and proxima_ejecucion <= now())::int as vencidos,
        coalesce(extract(epoch from now() - min(creado_en) filter (
          where procesado_en is null and fallido_en is null and proxima_ejecucion <= now())), 0)::int as retraso,
        count(*) filter (where procesado_en is null and fallido_en is null and intentos > 0)::int as con_reintentos,
        count(*) filter (where fallido_en > now() - interval '7 days')::int as fallidos
      from compartido.outbox
      where procesado_en is null or fallido_en is not null`);
    const fila = resultado.rows[0];
    return {
      outbox: {
        pendientes: fila?.pendientes ?? 0,
        vencidos: fila?.vencidos ?? 0,
        retrasoMaximoSegundos: fila?.retraso ?? 0,
        conReintentos: fila?.con_reintentos ?? 0,
        fallidosEnLaSemana: fila?.fallidos ?? 0,
      },
    };
  }
}
