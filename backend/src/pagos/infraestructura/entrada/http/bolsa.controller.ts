import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { ErrorDeValidacion } from '../../../../compartido/dominio/errores.js';
import { CONFIGURACION } from '../../../../configuracion/configuracion.module.js';
import type { Configuracion } from '../../../../configuracion/variables-de-entorno.js';
import {
  Publico,
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import { ComprarBolsa } from '../../../aplicacion/casos-de-uso/comprar-bolsa.js';
import {
  ListarPaquetes,
  ObtenerMiBolsa,
} from '../../../aplicacion/casos-de-uso/consultas.js';
import {
  vistaDePago,
  type VistaDeBolsa,
  type VistaDePago,
  type VistaDePaquete,
} from '../../../aplicacion/vistas.js';
import { CompraDeBolsaDto } from './dto-de-pagos.js';

const UN_MINUTO_MS = 60_000;

// Los paquetes de la bolsa de horas, su saldo y su compra. El precio de cada paquete sale de la base de datos: el
// cliente solo dice cuál quiere, nunca cuánto cuesta.
@Controller()
export class BolsaController {
  constructor(
    @Inject(ListarPaquetes) private readonly paquetes: ListarPaquetes,
    @Inject(ObtenerMiBolsa) private readonly bolsa: ObtenerMiBolsa,
    @Inject(ComprarBolsa) private readonly comprar: ComprarBolsa,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  // Pública, como el resto del catálogo: la landing y la pantalla de compra la leen igual.
  @Publico()
  @Get('catalogo/bolsas')
  async catalogo(): Promise<{ paquetes: VistaDePaquete[] }> {
    return { paquetes: await this.paquetes.ejecutar() };
  }

  @Roles('familiar')
  @Get('bolsa')
  async miBolsa(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ bolsa: VistaDeBolsa }> {
    return { bolsa: await this.bolsa.ejecutar(usuario.id) };
  }

  // 201 cuando se crea; 200 cuando es el reintento de una compra ya hecha con la misma `Idempotency-Key`.
  @Roles('familiar')
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @Post('bolsa/compras')
  async comprarPaquete(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: CompraDeBolsaDto,
    @Headers('idempotency-key') clave: string | string[] | undefined,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ pago: VistaDePago; urlDePago: string | null }> {
    if (typeof clave !== 'string' || clave.trim() === '') {
      throw new ErrorDeValidacion(
        'Falta el encabezado Idempotency-Key',
        'idempotencia.falta',
      );
    }
    const { pago, urlDePago, creado } = await this.comprar.ejecutar(
      usuario.id,
      cuerpo.paquete,
      clave.trim(),
    );
    respuesta.status(creado ? HttpStatus.CREATED : HttpStatus.OK);
    return {
      pago: vistaDePago(pago, this.configuracion.minutosParaPagar),
      urlDePago,
    };
  }
}
