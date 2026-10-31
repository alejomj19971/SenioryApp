import { Controller, Get, Inject } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import { ListarMisLiquidaciones } from '../../../aplicacion/casos-de-uso/consultas.js';
import type { VistaDeLiquidacion } from '../../../aplicacion/vistas.js';

// Lo que se le debe al cuidador por sus servicios terminados, y lo que ya se le pagó. Solo ve las suyas.
@Controller('liquidaciones')
export class LiquidacionesController {
  constructor(
    @Inject(ListarMisLiquidaciones)
    private readonly listar: ListarMisLiquidaciones,
  ) {}

  @Roles('cuidador')
  @Get()
  async misLiquidaciones(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ liquidaciones: VistaDeLiquidacion[] }> {
    return { liquidaciones: await this.listar.ejecutar(usuario.id) };
  }
}
