import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { Roles } from '../../../../compartido/http/decoradores.js';
import {
  COTIZADOR_DE_SERVICIOS,
  type CotizadorDeServicios,
} from '../../../aplicacion/puertos/entrada/cotizador-de-servicios.js';
import {
  vistaDeCotizacion,
  type VistaDeCotizacion,
} from '../../../aplicacion/vistas.js';
import { CotizacionDto } from './dto-de-cotizacion.js';

// Cuánto cuesta un servicio. Solo lee, por eso responde 200 y no 201. Lo calcula SIEMPRE el servidor: el
// monto que muestra el navegador es una vista previa, no una promesa.
@Controller('pagos')
export class CotizacionesController {
  constructor(
    @Inject(COTIZADOR_DE_SERVICIOS)
    private readonly cotizador: CotizadorDeServicios,
  ) {}

  @Roles('familiar')
  @HttpCode(HttpStatus.OK)
  @Post('cotizaciones')
  async cotizar(
    @Body() cuerpo: CotizacionDto,
  ): Promise<{ cotizacion: VistaDeCotizacion }> {
    const cotizacion = await this.cotizador.cotizar(
      cuerpo.cuidadorId,
      cuerpo.horas,
    );
    return { cotizacion: vistaDeCotizacion(cotizacion) };
  }
}
