import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import {
  ConfirmarPagoDeLiquidacion,
  ListarLiquidacionesPorPagar,
} from '../../../aplicacion/casos-de-uso/administracion-de-liquidaciones.js';
import { ListarMisLiquidaciones } from '../../../aplicacion/casos-de-uso/consultas.js';
import type {
  VistaDeLiquidacion,
  VistaDeLiquidacionParaAdmin,
} from '../../../aplicacion/vistas.js';
import type { LiquidacionId } from '../../../dominio/ids.js';
import { ConfirmarPagoDeLiquidacionDto } from './dto-de-pagos.js';

// Lo que se le debe al cuidador por sus servicios terminados, y lo que ya se le pagó. Un cuidador solo ve las
// suyas; un administrador ve la cola de todas las que faltan por pagar y las confirma a mano (dispersor
// manual: transfiere por fuera del sistema y lo confirma aquí).
@ApiTags('Pagos')
@Controller('liquidaciones')
export class LiquidacionesController {
  constructor(
    @Inject(ListarMisLiquidaciones)
    private readonly listar: ListarMisLiquidaciones,
    @Inject(ListarLiquidacionesPorPagar)
    private readonly porPagar: ListarLiquidacionesPorPagar,
    @Inject(ConfirmarPagoDeLiquidacion)
    private readonly confirmar: ConfirmarPagoDeLiquidacion,
  ) {}

  @Roles('cuidador')
  @Get()
  async misLiquidaciones(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ liquidaciones: VistaDeLiquidacion[] }> {
    return { liquidaciones: await this.listar.ejecutar(usuario.id) };
  }

  @Roles('administrador')
  @Get('por-pagar')
  async listarPorPagar(): Promise<{
    liquidaciones: VistaDeLiquidacionParaAdmin[];
  }> {
    return { liquidaciones: await this.porPagar.ejecutar() };
  }

  @Roles('administrador')
  @Patch(':id/confirmar-pago')
  async confirmarPago(
    @UsuarioActual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: ConfirmarPagoDeLiquidacionDto,
  ): Promise<{ liquidacion: VistaDeLiquidacion }> {
    return {
      liquidacion: await this.confirmar.ejecutar(
        admin,
        id as LiquidacionId,
        cuerpo.referencia,
      ),
    };
  }
}
